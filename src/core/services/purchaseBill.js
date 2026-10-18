/**
 * Purchase bill CREATE logic — extracted from the web app's purchase.js.
 * (Editing lives in the edit-purchase screen; viewing/payments/returns in purchase history.)
 */
import {
  buildProductLines,
  calcPurchaseTotals,
  calcSubtotal,
  invoiceNoProblem,
  suggestPurchaseInvoiceNumber,
  totalRolls,
} from '@/core/billing';
import { CREDIT_LINE } from '@/core/branding';
import { purchaseAckLine } from '@/core/business';
import { db } from '@/core/db';
import { toNum, todayISO } from '@/core/format';
import { PURCHASE_LEDGER, roundMoney, sameParty } from '@/core/ledger';
import { PAYMENT_METHODS, normalizeMethod, sumByMethod } from '@/core/paymentMethods';
import { CASH_LABEL, accountLabel, accountLabelWithBank } from '@/core/accountLabel';
import { invalidateStocksCache } from '@/features/overview/stocks/stocksService';
export function emptyPurchaseForm() {
  return {
    invoiceNo: '',
    invoiceDate: todayISO(),
    supplierPhone: '',
    supplierName: '',
    supplierAddress: '',
    rows: [{ description: '', rolls: '', qty: '0', rate: '0' }],
    previousBalance: 0,
    manualPreviousBalance: '0',
    discountAmount: '0',
    cash: '0',
    account: '0',
  };
}
export function purchaseFormTotals(form) {
  const subtotal = calcSubtotal(form.rows, { requirePositiveQty: true });
  return {
    subtotal,
    ...calcPurchaseTotals({
      subtotal,
      previousBalance: form.previousBalance,
      manualPreviousBalance: toNum(form.manualPreviousBalance),
      discount: toNum(form.discountAmount),
      cash: toNum(form.cash),
      account: toNum(form.account),
    }),
  };
}
/** Validation order/messages follow purchase.js. */
export function validatePurchaseBill(form, shortcuts) {
  if (!form.invoiceNo.trim())
    return { title: 'Missing Information', message: 'Please enter the Invoice No.' };
  const badNo = invoiceNoProblem(form.invoiceNo);
  if (badNo) return badNo;
  if (!form.invoiceDate) return { title: 'Missing Information', message: 'Please select an Invoice Date.' };
  if (!form.supplierName.trim())
    return { title: 'Missing Information', message: 'Please enter the Supplier Name.' };
  if (!form.supplierPhone.trim())
    return { title: 'Missing Information', message: 'Please enter the Supplier Phone Number.' };
  const described = form.rows.map((r) => (r.description ?? '').trim()).filter(Boolean);
  if (described.length === 0) {
    return { title: 'Empty Bill', message: 'Please add at least one product with a valid quantity.' };
  }
  if (shortcuts) {
    const known = new Set(shortcuts.map((s) => s.fullDescription.toLowerCase().trim()));
    if (!described.every((d) => known.has(d.toLowerCase()))) {
      return { title: 'Invalid Product', message: 'Please select products only from the suggestions list.' };
    }
  }
  const lines = buildProductLines(form.rows, { requirePositiveQty: true });
  if (lines.length === 0) {
    return { title: 'Empty Bill', message: 'Please add at least one product with a valid quantity.' };
  }
  return null;
}
export function buildPurchaseBill(form) {
  // purchase.js stores line items without `sno`
  const products = buildProductLines(form.rows, { requirePositiveQty: true }).map(
    ({ description, qty, rolls, rate, amount }) => ({
      description,
      qty,
      rolls,
      rate,
      amount,
    }),
  );
  const { subtotal, grandTotal, totalPaid, balanceDue } = purchaseFormTotals(form);
  return {
    invoiceNo: form.invoiceNo.trim(),
    invoiceDate: form.invoiceDate,
    supplierPhone: form.supplierPhone.trim(),
    supplierName: form.supplierName.trim(),
    supplierAddress: form.supplierAddress.trim(),
    products,
    subtotal: roundMoney(subtotal),
    previousBalance: form.previousBalance,
    manualPreviousBalance: toNum(form.manualPreviousBalance),
    discount: toNum(form.discountAmount),
    grandTotal: roundMoney(grandTotal),
    ...(form.bankAccountId ? { bankAccountId: form.bankAccountId } : {}),
    payment: {
      cash: toNum(form.cash),
      account: toNum(form.account),
      bankAccountId: form.bankAccountId || null,
      totalPaid: roundMoney(totalPaid),
      balanceDue: roundMoney(balanceDue),
    },
  };
}

export async function loadPurchaseSuggestion() {
  try {
    return suggestPurchaseInvoiceNumber(await db.getAllPurchaseBills());
  } catch (error) {
    console.error('Error fetching purchase invoices for suggestions:', error);
    return { lastInvoiceNo: 'Error loading', nextInvoiceNo: '001' };
  }
}
export async function purchaseNoExists(invoiceNo) {
  return !!(await db.getPurchaseBill(invoiceNo.trim()));
}
/**
 * purchase.js save: bill + one 'initial' payment record per method + supplier details for future auto-fill, then the
 * supplier's ledger is re-synced (this bill's previous balance and every later bill's follow — see core/ledger.js).
 */
export async function savePurchaseBillWithPayments(form, { replaceExisting = false } = {}) {
  const bill = buildPurchaseBill(form);
  let before = await db.getPurchaseBill(bill.invoiceNo).catch(() => null);
  // the user confirmed replacing another bill with this number: bin it (with its payments / returns) first
  if (before && replaceExisting) {
    await db.movePurchaseInvoiceToRecycleBin(bill.invoiceNo);
    before = null;
  }
  await db.savePurchaseBill(bill);
  const pay = bill.payment || {};
  const bId = bill.bankAccountId || pay.bankAccountId;
  const saves = [];
  PAYMENT_METHODS.forEach((method) => {
    if (pay.totalPaid > 0 && pay[method] > 0) {
      const paymentDoc = {
        id: `purchase_payment_${bill.invoiceNo}_initial_${method}`,
        invoiceNo: bill.invoiceNo,
        paymentDate: bill.invoiceDate,
        amount: pay[method],
        paymentMethod: method,
        paymentType: 'initial',
      };
      if (bId) {
        paymentDoc.bankAccountId = bId;
      }
      saves.push(db.savePurchasePayment(paymentDoc));
    }
  });
  if (bill.supplierPhone) {
    saves.push(
      db.saveSupplier(
        {
          phone: bill.supplierPhone,
          name: bill.supplierName,
          address: bill.supplierAddress,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true },
      ),
    );
  }
  await Promise.all(saves);
  await db.syncPurchaseLedger(bill, { changedNo: bill.invoiceNo, before });
  // overwriting a number that belonged to another supplier: that supplier's chain lost a bill
  if (before && !sameParty(PURCHASE_LEDGER, before, bill)) {
    await db.syncPurchaseLedger(before, { before });
  }
  invalidateStocksCache();
  return bill;
}
/** "Share Acknowledgement" text from purchase.js. */
export async function buildAcknowledgementMessage(form) {
  const lines = buildProductLines(form.rows, { requirePositiveQty: true });
  const { grandTotal } = purchaseFormTotals(form);
  let message = '';
  if (form.supplierName.trim()) message += `Supplier: ${form.supplierName.trim()}\n\n`;
  message += 'Products Received:\n';
  lines.forEach((p, i) => {
    const rolls = p.rolls > 0 ? ` - Rolls: ${p.rolls}` : '';
    message += `${i + 1}. ${p.description} - Qty: ${p.qty}${rolls} - Amount: ₹${p.amount.toFixed(2)}\n`;
  });
  const rollsReceived = totalRolls(lines);
  if (rollsReceived > 0) message += `\nTotal Rolls: ${rollsReceived}`;
  message += `\nTotal Amount: ₹${grandTotal.toFixed(2)}\n`;

  const invoiceNo = form.invoiceNo.trim();
  if (invoiceNo) {
    try {
      const [payments, returns, bankAccounts] = await Promise.all([
        db.getPurchasePaymentsByInvoice(invoiceNo).catch(() => []),
        db.getPurchaseReturnsByInvoice(invoiceNo).catch(() => []),
        db.getAllBankAccounts().catch(() => []),
      ]);

      const bankMap = new Map((bankAccounts || []).map((b) => [b.id, b]));
      const defaultBank = bankAccounts?.[0];

      // Cash / Account split (legacy UPI / GPay / bank documents count as Account).
      const { cash: cashPaid, account: accountPaid } =
        payments.length > 0
          ? sumByMethod(payments)
          : { cash: toNum(form.cash), account: toNum(form.account) };

      let accountBankName = '';
      const activeBankId = form.bankAccountId || payments.find((p) => p.bankAccountId)?.bankAccountId;
      const bank = activeBankId ? bankMap.get(activeBankId) : defaultBank;
      if (bank && accountPaid > 0) {
        accountBankName = accountLabel(bank);
      }

      const totalPaidAmount = cashPaid + accountPaid;
      const calcBalanceDue = grandTotal - totalPaidAmount;

      if (totalPaidAmount > 0 || cashPaid > 0 || accountPaid > 0) {
        message += '\nPayment Summary:\n';
        if (cashPaid > 0) message += `- Cash Paid: ₹${cashPaid.toFixed(2)}\n`;
        if (accountPaid > 0)
          message += `- Account Paid${accountBankName ? ` (${accountBankName})` : ''}: ₹${accountPaid.toFixed(2)}\n`;
        message += `- Total Amount Paid: ₹${totalPaidAmount.toFixed(2)}\n`;
        message += `- Balance Due: ₹${calcBalanceDue.toFixed(2)}\n`;
      }

      if (payments.length > 0) {
        message += '\nPayment History:\n';
        payments.forEach((p) => {
          const date = new Date(p.paymentDate).toLocaleDateString('en-IN');
          const isAccount = normalizeMethod(p.paymentMethod) === 'account';
          const pBank = p.bankAccountId ? bankMap.get(p.bankAccountId) : isAccount ? defaultBank : null;
          const methodLabel = !isAccount
            ? CASH_LABEL
            : pBank
              ? `Account: ${accountLabelWithBank(pBank)}`
              : 'Bank Account';
          const typeSuffix = p.paymentType === 'additional' ? ' - Additional Payment' : '';
          message += `- ${date}: ₹${p.amount.toFixed(2)} (${methodLabel}${typeSuffix})\n`;
        });
      }

      if (returns.length > 0) {
        message += '\nReturn History:\n';
        returns.forEach((r) => {
          const date = new Date(r.returnDate).toLocaleDateString('en-IN');
          const rolls = toNum(r.rolls) > 0 ? `, Rolls: ${toNum(r.rolls)}` : '';
          message += `- ${date}: ${r.description} (Qty: ${r.qty}${rolls}) - ₹${r.returnAmount.toFixed(2)}\n`;
        });
      }
    } catch (error) {
      console.error('Error fetching history for acknowledgement:', error);
    }
  }

  // closing line from the Settings page (default: "<business> has received the products mentioned above. Thank you.")
  message += `\n${purchaseAckLine()}\n\n${CREDIT_LINE}`;
  return message;
}
