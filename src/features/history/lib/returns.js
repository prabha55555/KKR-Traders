/**
 * Return-side pure logic (invoice-history.js addReturn / addReturnItem / updateReturnProductInfo /
 * calculateReturnAmount / saveReturn validation / getAlreadyReturnedQty).
 *
 * A return is always settled as a direct refund — Cash, or Account (stored as refundMethod 'bank' with the
 * bankAccountId). It never lowers the bill's balance due. Older returns without settlement fields (or settled
 * 'adjustment') still lower it: core/ledger isBalanceReturn decides, nothing here rewrites them.
 */
import { formatCurrency, toNum } from '@/core/format';
import { compareLedgerOrder, partyBills } from '@/core/ledger';
import { normalizeMethod } from '@/core/paymentMethods';
export const newReturnItem = (key) => ({
  key,
  choice: null,
  custom: '',
  qty: '0',
  rate: '0',
  reason: '',
});
/**
 * The products a party can return: every product on ANY of its bills, one line per description with the total
 * quantity sold and the rate of its latest bill (bills in ledger order, so the list — and therefore a picked index —
 * is the same every time it is built).
 */
export function aggregatePartyProducts(bills) {
  const productMap = new Map();
  for (const bill of [...bills].sort(compareLedgerOrder)) {
    for (const p of bill.products ?? []) {
      if (!p || !p.description) continue;
      const desc = String(p.description).trim();
      if (!productMap.has(desc)) {
        productMap.set(desc, {
          description: desc,
          qty: Number(toNum(p.qty).toFixed(2)),
          rate: Number(toNum(p.rate).toFixed(2)),
        });
      } else {
        const existing = productMap.get(desc);
        existing.qty = Number((existing.qty + toNum(p.qty)).toFixed(2));
        if (p.rate) existing.rate = Number(toNum(p.rate).toFixed(2));
      }
    }
  }
  return Array.from(productMap.values());
}
/**
 * "Add Return" product list of one bill — used by the sheet AND by the save, so `item.choice` resolves to the same
 * product in both: the products of all bills of the bill's ledger party (`kind` = SALES_LEDGER / PURCHASE_LEDGER),
 * or the bill's own lines when none have a description. `invoiceNos` = that party's bill numbers (their returns
 * count against the same quantities).
 */
export function partyReturnProducts(kind, allBills, bill) {
  const members = partyBills(kind, allBills, kind.name(bill), kind.phone(bill), bill.ledgerParty);
  const bills = members.some((b) => String(b.invoiceNo) === String(bill.invoiceNo))
    ? members
    : [...members, bill];
  const aggregated = aggregatePartyProducts(bills);
  return {
    products: aggregated.length > 0 ? aggregated : (bill.products ?? []),
    invoiceNos: new Set(bills.map((b) => String(b.invoiceNo))),
  };
}
/** updateReturnProductInfo(): picking an invoice product copies its rate; 'custom' clears the text and zeroes the rate. */
export function chooseReturnProduct(item, choice, products) {
  if (choice === 'custom') return { ...item, choice, custom: '', rate: '0' };
  if (choice === null) return { ...item, choice, custom: '' };
  const product = products[choice];
  return { ...item, choice, custom: '', rate: product ? String(product.rate ?? 0) : item.rate };
}
export function returnItemDescription(item, products) {
  if (item.choice === 'custom') return item.custom.trim();
  if (item.choice === null) return '';
  return products[item.choice]?.description ?? '';
}
/** calculateReturnAmount(): qty x rate rounded to 2 decimals (the read-only field held `amount.toFixed(2)`). */
export function returnItemAmount(item) {
  return Number((toNum(item.qty) * toNum(item.rate)).toFixed(2));
}
export function returnTotal(items) {
  return items.reduce((sum, item) => sum + returnItemAmount(item), 0);
}
/** getAlreadyReturnedQty(): quantity of one product (matched by description) returned so far. */
export function alreadyReturnedQty(returns, description) {
  return returns.filter((r) => r.description === description).reduce((total, r) => total + toNum(r.qty), 0);
}
/** description -> quantity already returned, for the "Returned: n" hint under each line. */
export function returnedQtyByDescription(returns) {
  const map = new Map();
  for (const r of returns) map.set(r.description, (map.get(r.description) ?? 0) + toNum(r.qty));
  return map;
}
/**
 * How a new return is settled: always a refund. Cash unless the method is Account / bank / UPI (stored as 'bank' —
 * the value every reader already understands), which needs the bank account the money leaves / enters.
 */
export function refundSettlement(input) {
  const method = normalizeMethod(input?.refundMethod) === 'account' ? 'bank' : 'cash';
  if (method === 'cash') return { settlementType: 'refund', refundMethod: 'cash' };
  return { settlementType: 'refund', refundMethod: 'bank', bankAccountId: input?.bankAccountId || '' };
}
/**
 * saveReturn() validation, in the web's order and wording:
 * date -> at least one item -> each line (description, qty > 0, rate > 0, qty within what is left to return)
 * -> an Account refund needs its bank account. There is no cap against the bill's balance: the money is refunded,
 * the balance due does not change.
 *
 * Deviation: two lines for the same product in one submission are checked against their COMBINED quantity (the web
 * checked each line against stored returns only, so the same product could be returned twice past its sold quantity).
 */
export function validateReturnDraft(input) {
  const { returnDate, items, products, existingReturns } = input;
  if (!returnDate) return { ok: false, title: 'Warning', message: 'Please select a return date.' };
  if (items.length === 0)
    return { ok: false, title: 'Warning', message: 'Please add at least one return item.' };
  const lines = [];
  const pending = new Map();
  let total = 0;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const description = returnItemDescription(item, products);
    const qty = toNum(item.qty);
    const rate = toNum(item.rate);
    const returnAmount = returnItemAmount(item);
    if (!description || qty <= 0 || rate <= 0) {
      return {
        ok: false,
        title: 'Warning',
        message: `Please fill all required fields for return item ${index + 1}`,
      };
    }
    if (typeof item.choice === 'number') {
      const maxQty = toNum(products[item.choice]?.qty);
      const alreadyReturned =
        alreadyReturnedQty(existingReturns, description) + (pending.get(description) ?? 0);
      if (qty + alreadyReturned > maxQty) {
        return {
          ok: false,
          title: 'Error',
          message: `Cannot return ${qty} items. Only ${maxQty - alreadyReturned} items available for return for "${description}".`,
        };
      }
      pending.set(description, (pending.get(description) ?? 0) + qty);
    }
    lines.push({ description, qty, rate, returnAmount, reason: item.reason, returnDate });
    total += returnAmount;
  }
  const settlement = refundSettlement(input);
  if (settlement.refundMethod === 'bank' && !settlement.bankAccountId) {
    return { ok: false, title: 'Warning', message: 'Please select the account for this refund.' };
  }
  return { ok: true, lines, total, settlement };
}
export const returnSuccessMessage = (total) =>
  `Return processed successfully! Total return amount: ₹${formatCurrency(total)}`;
