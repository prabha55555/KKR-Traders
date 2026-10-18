/**
 * Sales bill (invoice) create / edit logic — extracted from the web app's script.js + Utils.getFormData/validateForm.
 * UI-free so the Sales Bill screen (and tests) can share it.
 */
import {
  breakdownFromPayments,
  buildProductLines,
  calcSalesTotals,
  calcSubtotal,
  suggestSalesInvoiceNumber,
  saveCustomerDetails,
} from '@/core/billing';
import { db } from '@/core/db';
import { toNum, todayISO } from '@/core/format';
import { SALES_LEDGER, normalizePhone, sameParty } from '@/core/ledger';
import { PAYMENT_METHODS, foldBreakdown, normalizeMethod } from '@/core/paymentMethods';
import { invalidateStocksCache } from '@/features/overview/stocks/stocksService';
export function emptySalesForm() {
  return {
    invoiceNo: '',
    invoiceDate: todayISO(),
    customerName: '',
    customerAddress: '',
    customerPhone: '',
    rows: [{ description: '', rolls: '', qty: '0', rate: '0' }],
    previousBalance: 0,
    manualPreviousBalance: '0',
    discountAmount: '0',
    cash: '0',
    account: '0',
    bankAccountId: null,
    additionalPaymentsTotal: 0,
    additionalPaymentsBreakdown: { cash: 0, account: 0 },
    manualBillImage: null,
  };
}
export function salesFormTotals(form) {
  const subtotal = calcSubtotal(form.rows);
  return {
    subtotal,
    ...calcSalesTotals({
      subtotal,
      previousBalance: form.previousBalance,
      manualPreviousBalance: toNum(form.manualPreviousBalance),
      discount: toNum(form.discountAmount),
      cash: toNum(form.cash),
      account: toNum(form.account),
      additionalPaid: form.additionalPaymentsTotal,
    }),
  };
}
/** Utils.validateForm. `shortcuts` = the product catalogue; products must come from it (pass null to skip). */
export function validateSalesBill(form, shortcuts) {
  if (!form.invoiceNo.trim()) return { title: 'Missing Information', message: 'Please enter the Invoice No' };
  if (!form.invoiceDate) return { title: 'Missing Information', message: 'Please select an invoice date' };
  if (!form.customerName.trim())
    return { title: 'Missing Information', message: 'Please enter customer name' };
  const phone = form.customerPhone.trim();
  if (phone.length > 0 && phone.length < 10) {
    return { title: 'Invalid Information', message: 'Please enter a valid 10-digit phone number' };
  }
  const described = form.rows.map((r) => r.description.trim()).filter(Boolean);
  if (described.length === 0) {
    return {
      title: 'Empty Bill',
      message: 'Please add at least one item to the bill before saving or generating.',
    };
  }
  if (shortcuts) {
    const known = new Set(shortcuts.map((s) => s.fullDescription.toLowerCase().trim()));
    if (!described.every((d) => known.has(d.toLowerCase()))) {
      return { title: 'Invalid Product', message: 'Please select products only from the suggestions list.' };
    }
  }
  return null;
}
/** Utils.getFormData */
export function buildSalesInvoice(form) {
  const products = buildProductLines(form.rows);
  const { subtotal, grandTotal, totalPaid, balanceDue } = salesFormTotals(form);
  const initialPb = {
    cash: toNum(form.cash),
    account: toNum(form.account),
  };
  // Later payments (History) as { cash, account }; a legacy `upi` amount counts as Account.
  const addPb = foldBreakdown(form.additionalPaymentsBreakdown) || { cash: 0, account: 0 };
  const paymentBreakdown = {
    cash: initialPb.cash + addPb.cash,
    account: initialPb.account + addPb.account,
  };
  return {
    invoiceNo: form.invoiceNo.trim(),
    invoiceDate: form.invoiceDate,
    customerName: form.customerName,
    customerAddress: form.customerAddress,
    customerPhone: form.customerPhone,
    products,
    subtotal,
    previousBalance: form.previousBalance,
    manualPreviousBalance: toNum(form.manualPreviousBalance),
    discountAmount: toNum(form.discountAmount),
    grandTotal,
    paymentBreakdown,
    bankAccountId: form.bankAccountId || null,
    amountPaid: totalPaid,
    balanceDue,
    manualBillImage: form.manualBillImage || null,
    createdAt: new Date().toISOString(),
  };
}

/** True when a *different* bill already uses this number (saving would silently overwrite it). */
export async function invoiceNoExists(invoiceNo) {
  const existing = await db.getInvoice(invoiceNo.trim());
  return !!existing;
}
/** Next invoice number suggestion for the financial year of `invoiceDate`. */
export async function loadInvoiceSuggestion(invoiceDate) {
  try {
    const invoices = await db.getAllInvoices();
    return suggestSalesInvoiceNumber(invoices, invoiceDate);
  } catch (error) {
    console.error('Error generating next invoice number:', error);
    return { lastInvoiceNo: 'Error', nextInvoiceNo: '001', nextNumber: 1, cycleRestarted: false };
  }
}
/**
 * script.js saveBill: saves the invoice + customer, replaces the 'initial' payment records (one per method),
 * then re-syncs the customer's ledger (this bill's previous balance and every later bill's) — and the old customer's
 * ledger too when an edit moved the bill to another customer.
 * `replaceExisting`: the user confirmed overwriting a DIFFERENT bill that already uses this number (e.g. last
 * financial year's 001); that bill goes to the recycle bin first, with its payments and returns, so they are not
 * inherited by the new bill.
 * Returns the invoice as stored after the sync (its previous balance / totals may have been corrected).
 */
export async function saveSalesBill(form, { replaceExisting = false } = {}) {
  const invoiceNo = form.invoiceNo.trim();
  let before = await db.getInvoice(invoiceNo).catch(() => null);
  if (before && replaceExisting) {
    await db.moveInvoiceToRecycleBin(invoiceNo);
    before = null;
  }
  // the bill's payment records as they are NOW: a payment added from History while this edit was open still counts
  let existing = [];
  try {
    existing = await db.getPaymentsByInvoice(invoiceNo);
  } catch (err) {
    console.error('Error reading payments:', err);
  }
  const later = before ? existing.filter((p) => p.paymentType !== 'initial') : [];
  const invoice = buildSalesInvoice(
    before
      ? {
          ...form,
          additionalPaymentsTotal: later.reduce((sum, p) => sum + toNum(p.amount), 0),
          additionalPaymentsBreakdown: breakdownFromPayments(later),
        }
      : form,
  );
  // a phone-less bill stays in the ledger chain it was put in while it keeps its name and still has no phone
  if (before && keepsLedgerStamp(before, invoice)) invoice.ledgerParty = before.ledgerParty;
  const initialBreakdown = {
    cash: toNum(form.cash),
    account: toNum(form.account),
  };
  const saves = [db.saveInvoice(invoice)];
  const phone = form.customerPhone.trim();
  if (phone && phone.length >= 10) {
    saves.push(saveCustomerDetails(form.customerName.trim(), form.customerAddress.trim(), phone));
  }
  // Replace previously stored initial payments for this invoice (the web app did this on every save). This also
  // removes legacy `_initial_upi` documents: their amount is in the form's Account now.
  const initialBefore = existing.filter((p) => p.paymentType === 'initial');
  try {
    if (initialBefore.length > 0) await Promise.all(initialBefore.map((p) => db.deletePaymentDoc(p.id)));
  } catch (err) {
    console.error('Error clearing old initial payments:', err);
  }
  // money taken at the sale keeps its date when the bill is edited later (an older bill without records: its own date)
  const paymentDate = before
    ? (initialBefore.find((p) => p.paymentDate)?.paymentDate ?? invoice.invoiceDate ?? todayISO())
    : todayISO();
  PAYMENT_METHODS.forEach((method) => {
    if (initialBreakdown[method] > 0) {
      const paymentDoc = {
        id: `payment_${invoice.invoiceNo}_initial_${method}`,
        invoiceNo: invoice.invoiceNo,
        paymentDate,
        amount: initialBreakdown[method],
        paymentMethod: method,
        paymentType: 'initial',
      };
      if (invoice.bankAccountId) {
        paymentDoc.bankAccountId = invoice.bankAccountId;
      }
      saves.push(db.savePayment(paymentDoc));
    }
  });
  await Promise.all(saves);
  const rows = await db.syncSalesLedger(invoice, { changedNo: invoice.invoiceNo, before });
  if (before && !sameParty(SALES_LEDGER, before, invoice)) {
    await db.syncSalesLedger(before, { before });
  }
  invalidateStocksCache();
  return withSyncedLedger(invoice, rows);
}
/** An edit of a phone-less bill that still has no phone and the same name keeps the chain stamp it had. */
function keepsLedgerStamp(before, invoice) {
  if (before.ledgerParty === undefined || before.ledgerParty === null) return false;
  if (normalizePhone(before.customerPhone) || normalizePhone(invoice.customerPhone)) return false;
  const name = (n) =>
    String(n ?? '')
      .trim()
      .toLowerCase();
  return name(before.customerName) === name(invoice.customerName);
}
/** All of an older bill's untracked payment under its single payment method (legacy 'upi' / 'account' = Account). */
const singleMethodSplit = (invoice, total) =>
  normalizeMethod(invoice.paymentMethod) === 'account'
    ? { cash: 0, account: total }
    : { cash: total, account: 0 };
/** The saved bill with the derived values the ledger sync stored for it. */
function withSyncedLedger(bill, rows) {
  const row = rows?.find((r) => String(r.bill.invoiceNo) === String(bill.invoiceNo));
  if (!row) return bill;
  return {
    ...bill,
    previousBalance: row.previousBalance,
    grandTotal: row.grandTotal,
    balanceDue: row.balanceDue,
  };
}
/**
 * What was paid when the bill was written, for an invoice without 'initial' payment documents (older bills): the paid
 * total minus the later payments, split like the stored breakdown when that adds up, otherwise as cash. Without this
 * the edit form showed 0 and Update erased the amount paid (raising this and every later balance).
 */
function untrackedInitialSplit(invoice, additionalBreakdown, additionalTotal) {
  const total = Math.max(0, toNum(invoice.amountPaid) - additionalTotal);
  const pb = foldBreakdown(invoice.paymentBreakdown);
  if (pb) {
    const split = {
      cash: Math.max(0, pb.cash - additionalBreakdown.cash),
      account: Math.max(0, pb.account - additionalBreakdown.account),
    };
    if (Math.abs(split.cash + split.account - total) < 0.005) return split;
  }
  return singleMethodSplit(invoice, total);
}
/** script.js loadInvoiceForEditing + Utils.setFormData: turn a stored invoice back into an editable form. */
export async function loadSalesBillForEditing(invoiceNo) {
  const invoice = await db.getInvoice(invoiceNo);
  if (!invoice) return null;
  let additionalPaymentsTotal = 0;
  let additionalPaymentsBreakdown = { cash: 0, account: 0 };
  let paymentBreakdown = foldBreakdown(invoice.paymentBreakdown);
  // the bank the money taken AT THE SALE went to (a later payment into another bank must not move it on re-save)
  let initialBank = null;
  try {
    const payments = await db.getPaymentsByInvoice(invoiceNo);
    const initial = payments.filter((p) => p.paymentType === 'initial');
    initialBank =
      initial.find((p) => normalizeMethod(p.paymentMethod) === 'account' && p.bankAccountId)?.bankAccountId ??
      null;
    const additional = payments.filter((p) => p.paymentType !== 'initial');
    additionalPaymentsTotal = additional.reduce((sum, p) => sum + p.amount, 0);
    additionalPaymentsBreakdown = breakdownFromPayments(additional);
    paymentBreakdown =
      initial.length > 0
        ? breakdownFromPayments(initial)
        : untrackedInitialSplit(invoice, additionalPaymentsBreakdown, additionalPaymentsTotal);
  } catch (e) {
    console.error('Error loading true payment history', e);
  }
  // Old invoices without a breakdown: everything was cash. A legacy UPI amount is loaded as Account (the form has no
  // UPI field, so it must not stay hidden in the totals).
  const pb = paymentBreakdown ?? singleMethodSplit(invoice, toNum(invoice.amountPaid));
  const form = {
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    customerName: invoice.customerName || '',
    customerAddress: invoice.customerAddress || '',
    customerPhone: invoice.customerPhone || '',
    rows: invoice.products?.length
      ? invoice.products.map((p) => ({
          description: p.description,
          // older lines have no roll count: the box stays blank
          rolls: toNum(p.rolls) ? String(p.rolls) : '',
          qty: String(p.qty),
          rate: String(p.rate),
        }))
      : [{ description: '', rolls: '', qty: '0', rate: '0' }],
    previousBalance: invoice.previousBalance ?? 0,
    manualPreviousBalance:
      invoice.manualPreviousBalance !== undefined ? String(invoice.manualPreviousBalance) : '',
    // older invoices stored the discount as `discount` (the ledger and History still read it)
    discountAmount: String(toNum(invoice.discountAmount) || toNum(invoice.discount) || 0),
    cash: String(pb.cash || 0),
    account: String(pb.account || 0),
    additionalPaymentsTotal,
    additionalPaymentsBreakdown,
    bankAccountId: initialBank || invoice.bankAccountId || null,
    manualBillImage: invoice.manualBillImage || null,
  };
  return { form, invoice };
}
