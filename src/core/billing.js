/**
 * Billing business logic — the non-DOM parts of the web app's `Utils` class.
 * Every formula here is a 1:1 port; comments call out web-app quirks that are preserved on purpose.
 */
import { db } from './db';
import { getFinancialYear, toNum } from './format';
import { normalizeMethod } from './paymentMethods';
import {
  PURCHASE_LEDGER,
  SALES_LEDGER,
  isBalanceReturn,
  partyBills,
  previousBalanceAt,
  returnsTotalsByInvoice,
  roundMoney,
} from './ledger';
export const rowAmount = (qty, rate) => toNum(qty) * toNum(rate);
export function calcSubtotal(rows) {
  return (rows || []).reduce((sum, r) => sum + rowAmount(r.qty, r.rate), 0);
}
/**
 * Rows with a description become product lines; `sno` is sequential. `rolls` (the roll count, optional — 0 when not
 * typed) is kept on every line but never decides whether a line is kept and never enters the money: amount = qty × rate.
 */
export function buildProductLines(rows, opts = {}) {
  const lines = [];
  rows.forEach((row) => {
    const description = row.description.trim();
    const qty = toNum(row.qty);
    const rate = toNum(row.rate);
    if (!description) return;
    if (opts.requirePositiveQty && !(qty > 0)) return;
    lines.push({
      sno: lines.length + 1,
      description,
      qty,
      rolls: toNum(row.rolls),
      rate,
      amount: qty * rate,
    });
  });
  return lines;
}
/** Total roll count of bill lines / form rows (lines without rolls count 0). */
export function totalRolls(lines) {
  return (lines || []).reduce((sum, l) => sum + toNum(l?.rolls), 0);
}
/** Sales: grand total = subtotal + previous balance + opening balance - discount (may be negative). */
export function calcSalesTotals(i) {
  const grandTotal = i.subtotal + i.previousBalance + (i.manualPreviousBalance || 0) - (i.discount || 0);
  const totalPaid = (i.cash || 0) + (i.account || 0) + (i.additionalPaid || 0);
  return { grandTotal, totalPaid, balanceDue: grandTotal - totalPaid };
}
/**
 * Purchase: identical (payments added later are not part of the create form). The web floored the grand total at
 * zero, which silently threw away an advance / credit with the supplier; like sales, a negative total is kept and
 * carried into the next bill (see core/ledger.js).
 */
export function calcPurchaseTotals(i) {
  return calcSalesTotals({ ...i, additionalPaid: 0 });
}
/**
 * Rebuild the cash/account split from stored payment documents (script.js loadInvoiceForEditing). Legacy UPI / GPay /
 * bank documents count as Account (see core/paymentMethods).
 */
export function breakdownFromPayments(payments) {
  return payments.reduce(
    (acc, p) => {
      acc[normalizeMethod(p.paymentMethod)] += toNum(p.amount);
      return acc;
    },
    { cash: 0, account: 0 },
  );
}
// ====================================================================== purchase bill field access
/**
 * New purchase bills keep payment data in a nested `payment` object; edited/legacy bills use top-level fields.
 * All screens read through these helpers exactly the way purchase-history.js did.
 */
export function purchaseBalanceDue(bill) {
  return bill.payment?.balanceDue !== undefined ? toNum(bill.payment.balanceDue) : toNum(bill.balanceDue);
}
export function purchaseAmountPaid(bill) {
  return bill.payment?.totalPaid || bill.amountPaid || 0;
}
/** Highest numeric invoice number within the financial year of `targetDate`. */
export function highestInvoiceNumber(invoices, targetDate) {
  const currentFY = getFinancialYear(targetDate);
  let highestNumber = 0;
  let highestInvoiceNo = null;
  invoices.forEach((invoice) => {
    if (!invoice.invoiceDate || getFinancialYear(invoice.invoiceDate) !== currentFY) return;
    if (!invoice.invoiceNo) return;
    const m = String(invoice.invoiceNo).match(/\d+/);
    if (!m) return;
    const n = parseInt(m[0], 10);
    if (n > highestNumber) {
      highestNumber = n;
      highestInvoiceNo = invoice.invoiceNo;
    }
  });
  return { highestNumber, highestInvoiceNo };
}
/** Sales numbering: 001..999 per financial year, keeping any letter prefix/suffix of the last invoice. */
export function suggestSalesInvoiceNumber(invoices, targetDate) {
  const { highestNumber, highestInvoiceNo } = highestInvoiceNumber(invoices, targetDate);
  if (highestNumber === 0) {
    return { lastInvoiceNo: 'No invoices yet', nextInvoiceNo: '001', nextNumber: 1, cycleRestarted: false };
  }
  const nextNumber = highestNumber >= 999 ? 1 : highestNumber + 1;
  const formatted = nextNumber.toString().padStart(3, '0');
  let nextInvoiceNo = formatted;
  if (highestInvoiceNo && /[A-Za-z]/.test(highestInvoiceNo)) {
    const prefix = highestInvoiceNo.match(/^[A-Za-z]+/);
    const suffix = highestInvoiceNo.match(/[A-Za-z]+$/);
    if (prefix && suffix) nextInvoiceNo = `${prefix[0]}${formatted}${suffix[0]}`;
    else if (prefix) nextInvoiceNo = `${prefix[0]}${formatted}`;
    else if (suffix) nextInvoiceNo = `${formatted}${suffix[0]}`;
  }
  let lastInvoiceNo = highestInvoiceNo || '';
  if (highestInvoiceNo && /^\d+$/.test(highestInvoiceNo)) lastInvoiceNo = highestInvoiceNo.padStart(3, '0');
  return { lastInvoiceNo, nextInvoiceNo, nextNumber, cycleRestarted: nextNumber === 1 };
}
/** Purchase numbering (purchase.js): highest number across ALL bills (a leading "P-" is ignored), +1, 3-digit pad. */
export function suggestPurchaseInvoiceNumber(bills) {
  if (bills.length === 0) return { lastInvoiceNo: 'No invoices yet', nextInvoiceNo: '001' };
  let maxNum = 0;
  bills.forEach((b) => {
    if (!b.invoiceNo) return;
    let s = b.invoiceNo.toString();
    if (s.startsWith('P-')) s = s.substring(2);
    const n = parseInt(s, 10);
    if (!Number.isNaN(n) && n > maxNum) maxNum = n;
  });
  if (maxNum > 0) {
    return {
      lastInvoiceNo: String(maxNum).padStart(3, '0'),
      nextInvoiceNo: String(maxNum + 1).padStart(3, '0'),
    };
  }
  return { lastInvoiceNo: '001', nextInvoiceNo: '001' };
}
const EMPTY_BALANCE = {
  totalPreviousBills: 0,
  balanceCarriedForward: 0,
  invoiceCount: 0,
  lastInvoiceNo: null,
};
const byInvoiceNoAsc = (a, b) => (parseInt(a.invoiceNo) || 0) - (parseInt(b.invoiceNo) || 0);
export async function calculateTotalReturns(invoiceNo) {
  try {
    const returns = await db.getReturnsByInvoice(invoiceNo);
    return returns.reduce((total, r) => total + r.returnAmount, 0);
  } catch (error) {
    console.error('Error calculating returns for invoice:', invoiceNo, error);
    return 0;
  }
}
/** Returns of one bill: `total` (all) and `balance` (only those settled against the balance, not refunded). */
function splitReturns(returns) {
  return returns.reduce(
    (acc, r) => {
      const amount = toNum(r.returnAmount);
      acc.total += amount;
      if (isBalanceReturn(r)) acc.balance += amount;
      return acc;
    },
    { total: 0, balance: 0 },
  );
}
/**
 * Stores totalReturns (all returns) and adjustedBalanceDue = balanceDue - returns settled against the balance (a
 * return refunded in cash / bank does not lower what is owed; the web subtracted it as well).
 */
export async function updateInvoiceWithReturns(invoiceNo) {
  try {
    const returns = splitReturns(await db.getReturnsByInvoice(invoiceNo));
    const invoice = await db.getInvoice(invoiceNo);
    if (invoice) {
      await db.saveInvoice({
        ...invoice,
        totalReturns: roundMoney(returns.total),
        adjustedBalanceDue: roundMoney(toNum(invoice.balanceDue) - returns.balance),
      });
    }
  } catch (error) {
    console.error('Error updating invoice with returns:', error);
  }
}
export async function calculateTotalPurchaseReturns(invoiceNo) {
  try {
    const returns = await db.getPurchaseReturnsByInvoice(invoiceNo);
    return returns.reduce((total, r) => total + (parseFloat(String(r.returnAmount)) || 0), 0);
  } catch (error) {
    console.error('Error calculating purchase returns for invoice:', invoiceNo, error);
    return 0;
  }
}
/** Purchase equivalent of updateInvoiceWithReturns. */
export async function updatePurchaseBillWithReturns(invoiceNo) {
  try {
    const returns = splitReturns(await db.getPurchaseReturnsByInvoice(invoiceNo));
    const bill = await db.getPurchaseBill(invoiceNo);
    if (bill) {
      await db.savePurchaseBill({
        ...bill,
        totalReturns: roundMoney(returns.total),
        adjustedBalanceDue: roundMoney(purchaseBalanceDue(bill) - returns.balance),
      });
    }
  } catch (error) {
    console.error('Error updating purchase bill with returns:', error);
  }
}
/** Customer's balance carried forward = the most recent invoice's balance due, less its returns. */
export async function calculateCustomerBalance(customerName, currentInvoiceNo = null) {
  try {
    const invoices = await db.getAllInvoices();
    const customerInvoices = invoices
      .filter((i) => i.customerName === customerName && i.invoiceNo !== currentInvoiceNo)
      .sort((a, b) => byInvoiceNoAsc(b, a));
    if (customerInvoices.length === 0) return { ...EMPTY_BALANCE };
    const mostRecent = customerInvoices[0];
    const totalReturns = await calculateTotalReturns(mostRecent.invoiceNo);
    return {
      totalPreviousBills: customerInvoices.reduce((sum, i) => sum + i.grandTotal, 0),
      balanceCarriedForward: mostRecent.balanceDue - totalReturns,
      invoiceCount: customerInvoices.length,
      lastInvoiceNo: mostRecent.invoiceNo,
    };
  } catch (error) {
    console.error('Error calculating customer balance:', error);
    return { ...EMPTY_BALANCE };
  }
}
export async function calculateSupplierBalance(supplierName, currentInvoiceNo = null) {
  try {
    const bills = await db.getAllPurchaseBills();
    const supplierBills = bills
      .filter((b) => b.supplierName === supplierName && b.invoiceNo !== currentInvoiceNo)
      .sort((a, b) => byInvoiceNoAsc(b, a));
    if (supplierBills.length === 0) return { ...EMPTY_BALANCE };
    const mostRecent = supplierBills[0];
    return {
      totalPreviousBills: supplierBills.reduce((sum, b) => sum + b.grandTotal, 0),
      balanceCarriedForward: mostRecent.balanceDue || 0,
      invoiceCount: supplierBills.length,
      lastInvoiceNo: mostRecent.invoiceNo,
    };
  } catch (error) {
    console.error('Error calculating supplier balance:', error);
    return { ...EMPTY_BALANCE };
  }
}
const NO_PREVIOUS = { totalPreviousBills: 0, balanceCarriedForward: 0, invoiceCount: 0 };
/** previousBalanceAt -> the shape the bill screens use; `opening()` is asked only for a party's very first bill. */
async function toCarried(result, opening) {
  if (result.count > 0) {
    return {
      totalPreviousBills: result.totalPreviousBills,
      balanceCarriedForward: result.previousBalance,
      invoiceCount: result.count,
      lastInvoiceNo: result.previousBill?.invoiceNo ?? null,
    };
  }
  const balance = result.previousBalance !== null ? result.previousBalance : await opening();
  return { ...NO_PREVIOUS, balanceCarriedForward: roundMoney(balance) };
}
/**
 * "Previous Balance Due" of a sales bill: the closing balance (balance due − returns) of the customer's bill just
 * before it in the running-balance ledger (core/ledger.js) — for a new bill the latest one, for an edited bill the one
 * before it. `invoiceDate` places a back-dated bill correctly (omitted: after every stored bill / the bill's own date).
 * A customer's first bill starts from their opening balance. Customers are matched by phone when both sides have
 * one, otherwise by case-insensitive name.
 *
 * The values are computed from each bill's own lines, payments and returns, so they are right even when stored
 * balances of older bills were never refreshed (no more "re-save the previous bill to fix the balance").
 */
export async function calculatePreviousBalanceAtTime(
  customerName,
  customerPhone = null,
  currentInvoiceNo = null,
  invoiceDate = null,
) {
  try {
    const [invoices, returns] = await Promise.all([db.getAllInvoices(), db.getAllReturns({ strict: true })]);
    const bills = partyBills(SALES_LEDGER, invoices, customerName, customerPhone);
    const result = previousBalanceAt(
      bills,
      SALES_LEDGER,
      { invoiceNo: currentInvoiceNo, invoiceDate },
      { returnsByInvoice: returnsTotalsByInvoice(returns) },
    );
    return await toCarried(result, async () => {
      const phone = String(customerPhone ?? '').trim();
      const customer = phone ? await db.getCustomer(phone) : null;
      return toNum(customer?.openingBalance);
    });
  } catch (error) {
    console.error('Error calculating previous balance at time:', error);
    return { ...NO_PREVIOUS, failed: true };
  }
}
/**
 * Supplier equivalent (purchase bills + purchase returns). A failed read is reported as `failed` (callers keep the
 * value they have instead of showing 0). Reads both the nested `payment` object of new bills and
 * the top-level fields of edited / legacy bills — the web read only the top-level `balanceDue`, so a bill created on
 * the purchase screen carried 0 until it was edited.
 */
export async function calculateSupplierPreviousBalanceAtTime(
  supplierName,
  supplierPhone = null,
  currentInvoiceNo = null,
  invoiceDate = null,
) {
  try {
    const [bills, returns] = await Promise.all([
      db.getAllPurchaseBills({ strict: true }),
      db.getAllPurchaseReturns(),
    ]);
    const own = partyBills(PURCHASE_LEDGER, bills, supplierName, supplierPhone);
    const result = previousBalanceAt(
      own,
      PURCHASE_LEDGER,
      { invoiceNo: currentInvoiceNo, invoiceDate },
      { returnsByInvoice: returnsTotalsByInvoice(returns) },
    );
    return await toCarried(result, async () => {
      const phone = String(supplierPhone ?? '').trim();
      const supplier = phone ? await db.getSupplier(phone) : null;
      return toNum(supplier?.openingBalance);
    });
  } catch (error) {
    console.error('Error calculating supplier previous balance at time:', error);
    return { ...NO_PREVIOUS, failed: true };
  }
}
/** Re-syncs the ledger of the customer of `updatedInvoiceNo` (see Database.syncSalesLedger). */
export const updateSubsequentInvoices = (customerName, updatedInvoiceNo) =>
  db.updateSubsequentInvoices(customerName, updatedInvoiceNo);
/** Re-syncs the ledger of the supplier of `invoiceNo` (bill read fresh; nothing happens if it is gone). */
export async function syncSupplierLedgerOf(invoiceNo) {
  const bill = await db.getPurchaseBill(invoiceNo);
  if (bill) await db.syncPurchaseLedger(bill);
}
export async function saveCustomerDetails(name, address, phone) {
  if (!phone) {
    console.error('Phone number is required to save customer');
    return;
  }
  try {
    await db.saveCustomer(
      {
        phone: phone.trim(),
        name: name ? name.trim() : '',
        address: address ? address.trim() : '',
        lastUpdated: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error('Error saving customer details:', error);
  }
}
