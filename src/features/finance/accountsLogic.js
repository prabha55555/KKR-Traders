import { accountLabel, CASH_LABEL } from '@/core/accountLabel';
import { db } from '@/core/db';
import { invoiceNoLabel, toNum } from '@/core/format';
import { foldBreakdown, normalizeMethod, PAYMENT_METHODS, sumByMethod } from '@/core/paymentMethods';
import { withUntrackedInitialPayment } from '@/features/history/purchase/purchasePayments';

/** `type` of the account_transactions doc written by the cash "Edit Balance" action. */
export const BALANCE_ADJUSTMENT = 'Balance Adjustment';

/** True for the "outside the system" side of an account_transactions doc (null / 'external' / 'manual'). */
const isExternalAccount = (id) => !id || id === 'external' || id === 'manual';

/**
 * Direction of an account_transactions doc as the user sees it: 'in' (money added from outside: Add Amount, an
 * Edit Balance increase), 'out' (money removed to outside: a Deduction, an Edit Balance decrease, a dyeing/combing
 * payment) or 'transfer' (a legacy move between two of our own accounts).
 */
export function txDirection(tx) {
  const fromOutside = isExternalAccount(tx?.fromAccount);
  const toOutside = isExternalAccount(tx?.toAccount);
  if (fromOutside && !toOutside) return 'in';
  if (toOutside && !fromOutside) return 'out';
  return 'transfer';
}

/** Ids of the account_transactions copies of processing-lot payments and of old dyeing / combing batch payments. */
const LOT_PAYMENT_PREFIXES = ['lot_pay_', 'dye_pay_', 'cb_pay_', 'comb_pay_'];

/**
 * True for the finance copy of a lot (or old batch) payment. The lot keeps its own record of the payment, so deleting
 * only this copy would leave the lot showing it as paid: these are undone from Dyeing & Combing (the lot's Payment
 * History removes both).
 */
export const isLotPaymentEntry = (tx) =>
  LOT_PAYMENT_PREFIXES.some((prefix) => String(tx?.id ?? '').startsWith(prefix));

/** Where a lot payment is undone (shown instead of the Undo button on its finance copy). */
export const LOT_PAYMENT_UNDO_HINT = 'Undo from Dyeing & Combing';

const round2 = (n) => Math.round(toNum(n) * 100) / 100;

/**
 * The account_transactions doc that takes Cash in Hand from `cashBalance` (what the app computes now) to `target`
 * (the cash actually counted). Only the DIFFERENCE is recorded, so every balance calculation picks it up through the
 * normal from/to rule, and Undo (deleting the doc) restores the previous balance. settings/cash_in_hand is never
 * touched. Returns null when the balance would not change.
 */
export function buildCashBalanceEdit({ cashBalance, target, date, notes = '' }) {
  const previousBalance = round2(cashBalance);
  const newBalance = round2(target);
  const delta = round2(newBalance - previousBalance);
  if (Math.abs(delta) < 0.01) return null;
  return {
    date,
    type: BALANCE_ADJUSTMENT,
    category: 'Cash Balance Edit',
    fromAccount: delta < 0 ? 'cash' : null,
    toAccount: delta > 0 ? 'cash' : null,
    amount: Math.abs(delta),
    adjustment: true,
    previousBalance,
    newBalance,
    notes: String(notes || '').trim(),
  };
}

// ------------------------------------------------------------------ untracked first payment of older bills
/**
 * One synthetic payment record per method (`paymentType: 'initial'`, dated the bill date, into the bill's bank) for the
 * money paid WITH an older bill. Marked `untracked` so the activity list can point at the bill itself.
 */
function untrackedInitialRecords(bill, split, paymentDate, bankAccountId) {
  return PAYMENT_METHODS.filter((m) => toNum(split?.[m]) > 0).map((m) => ({
    id: `untracked_initial_${bill.invoiceNo}_${m}`,
    invoiceNo: bill.invoiceNo,
    paymentDate,
    amount: toNum(split[m]),
    paymentMethod: m,
    paymentType: 'initial',
    ...(bankAccountId ? { bankAccountId } : {}),
    untracked: true,
  }));
}

/**
 * What was paid when an older sales invoice was written, for an invoice whose payment records have no 'initial' one
 * (as loadSalesBillForEditing in core/services/salesBill.js): the paid total minus the later payments, split like the
 * stored (cumulative) breakdown minus theirs when that adds up, else under the invoice's single payment method.
 * Null when there is nothing untracked.
 */
export function untrackedSalesInitialSplit(inv, records = []) {
  if (records.some((p) => p.paymentType === 'initial')) return null;
  const later = sumByMethod(records);
  const total = Math.max(0, toNum(inv.amountPaid) - later.cash - later.account);
  if (total < 0.005) return null;
  const pb = foldBreakdown(inv.paymentBreakdown);
  if (pb) {
    const split = {
      cash: Math.max(0, pb.cash - later.cash),
      account: Math.max(0, pb.account - later.account),
    };
    if (Math.abs(split.cash + split.account - total) < 0.005) return split;
  }
  return normalizeMethod(inv.paymentMethod) === 'account'
    ? { cash: 0, account: total }
    : { cash: total, account: 0 };
}

/**
 * A sales invoice's payment records plus, when none of them is its 'initial' payment (older invoices), the money paid
 * with the invoice as synthetic records — counting only the records dropped it from the balances.
 */
export function withUntrackedSalesInitial(inv, records = []) {
  const split = untrackedSalesInitialSplit(inv, records);
  if (!split) return records;
  return [...untrackedInitialRecords(inv, split, inv.invoiceDate || inv.date, inv.bankAccountId), ...records];
}

/**
 * A purchase bill's payment records plus, when none of them is its 'initial' payment (older bills), the money paid with
 * the bill — the same untracked first payment Purchase History shows (withUntrackedInitialPayment). History books it
 * under one method; a nested cash + account split is kept apart here so each side's balance gets its own share.
 */
export function withUntrackedPurchaseInitial(bill, records = []) {
  const all = withUntrackedInitialPayment(bill, records);
  if (all.length === records.length) return records;
  const [first] = all;
  const nested = foldBreakdown(bill.payment);
  // the nested split only when it accounts for exactly the untracked amount; otherwise all of it under its method
  const split =
    nested && Math.abs(nested.cash + nested.account - toNum(first.amount)) < 0.005
      ? nested
      : { [normalizeMethod(first.paymentMethod)]: toNum(first.amount) };
  return [...untrackedInitialRecords(bill, split, first.paymentDate, first.bankAccountId), ...records];
}

/**
 * Calculates current balances for all bank accounts and cash in hand.
 *
 * Balance Formula:
 * For each Bank Account:
 *   Opening Balance
 *   + Inflows from Sales paid by Account (paymentBreakdown.account, plus any legacy `upi` amount)
 *   + Inflows from Borrowed Amounts (loans received into this bank account)
 *   + account_transactions credited to it (Add Amount, legacy transfers In)
 *   - Outflows for Purchases (where payment was debited from this bank account)
 *   - Outflows for Loan Repayments (paid from this bank account)
 *   - account_transactions debited from it (Deductions, dyeing/combing payments, legacy transfers Out)
 *
 * For Cash in Hand:
 *   Opening Cash Balance
 *   + Inflows from Sales (Cash collected)
 *   + Inflows from Borrowed Amounts (loans received in Cash)
 *   + account_transactions credited to cash (Add Amount, Edit Balance up, legacy withdrawals from banks)
 *   - Outflows for Purchases (Cash paid)
 *   - Outflows for Expenses (Cash paid)
 *   - Outflows for Loan Repayments (paid in Cash)
 *   - account_transactions debited from cash (Deductions, Edit Balance down, legacy deposits to banks)
 */
export function computeAccountBalances({
  bankAccounts = [],
  cashOpening = 0,
  salesInvoices = [],
  purchaseBills = [],
  expenses = [],
  financeRecords = [],
  accountTransactions = [],
  salesPayments = [],
  purchasePayments = [],
  salesReturns = [],
  purchaseReturns = [],
}) {
  // Map bank accounts by id
  const bankMap = {};
  bankAccounts.forEach((acc) => {
    bankMap[acc.id] = {
      ...acc,
      openingBalance: toNum(acc.openingBalance),
      currentBalance: toNum(acc.openingBalance),
      inflows: 0,
      outflows: 0,
    };
  });

  let cashBalance = toNum(cashOpening);
  let cashInflows = 0;
  let cashOutflows = 0;

  // 1. Borrowed funds (Finance records)
  financeRecords.forEach((record) => {
    const principal = toNum(record.principal);
    const dest = record.depositAccount || 'cash'; // 'cash' or bank account id

    if (dest === 'cash') {
      cashBalance += principal;
      cashInflows += principal;
    } else if (bankMap[dest]) {
      bankMap[dest].currentBalance += principal;
      bankMap[dest].inflows += principal;
    }

    // Loan repayments (outflow)
    (record.payments || []).forEach((p) => {
      const pAmt = toNum(p.amount);
      const source = p.sourceAccount || (p.mode === 'Cash' ? 'cash' : Object.keys(bankMap)[0] || 'cash');
      if (source === 'cash') {
        cashBalance -= pAmt;
        cashOutflows += pAmt;
      } else if (bankMap[source]) {
        bankMap[source].currentBalance -= pAmt;
        bankMap[source].outflows += pAmt;
      } else {
        cashBalance -= pAmt;
        cashOutflows += pAmt;
      }
    });
  });

  // 2. Sales Inflows
  const sPaymentsByInv = new Map();
  (salesPayments || []).forEach((p) => {
    if (!p.invoiceNo) return;
    const invNo = String(p.invoiceNo);
    if (!sPaymentsByInv.has(invNo)) sPaymentsByInv.set(invNo, []);
    sPaymentsByInv.get(invNo).push(p);
  });

  salesInvoices.forEach((inv) => {
    const invNo = String(inv.invoiceNo || inv.billNo || '');
    const paymentsForInv = sPaymentsByInv.get(invNo);

    if (paymentsForInv && paymentsForInv.length > 0) {
      // an older invoice's first payment has no record: it counts too
      withUntrackedSalesInitial(inv, paymentsForInv).forEach((p) => {
        const amt = toNum(p.amount);
        if (p.paymentMethod === 'cash') {
          cashBalance += amt;
          cashInflows += amt;
        } else {
          const targetBankId = p.bankAccountId || inv.bankAccountId || Object.keys(bankMap)[0];
          if (targetBankId && bankMap[targetBankId]) {
            bankMap[targetBankId].currentBalance += amt;
            bankMap[targetBankId].inflows += amt;
          }
        }
      });
    } else {
      const cashPaid = toNum(
        inv.paymentBreakdown?.cash || (inv.paymentMethod === 'cash' ? inv.amountPaid : 0),
      );
      const upiPaid = toNum(inv.paymentBreakdown?.upi || (inv.paymentMethod === 'upi' ? inv.amountPaid : 0));
      const accPaid = toNum(
        inv.paymentBreakdown?.account || (inv.paymentMethod === 'account' ? inv.amountPaid : 0),
      );

      if (cashPaid > 0) {
        cashBalance += cashPaid;
        cashInflows += cashPaid;
      }

      const targetBankId = inv.bankAccountId || Object.keys(bankMap)[0];
      const bankInflow = upiPaid + accPaid;
      if (bankInflow > 0 && targetBankId && bankMap[targetBankId]) {
        bankMap[targetBankId].currentBalance += bankInflow;
        bankMap[targetBankId].inflows += bankInflow;
      }
    }
  });

  // 3. Purchase Outflows
  const pPaymentsByInv = new Map();
  (purchasePayments || []).forEach((p) => {
    if (!p.invoiceNo) return;
    const invNo = String(p.invoiceNo);
    if (!pPaymentsByInv.has(invNo)) pPaymentsByInv.set(invNo, []);
    pPaymentsByInv.get(invNo).push(p);
  });

  purchaseBills.forEach((bill) => {
    const billNo = String(bill.billNumber || bill.invoiceNo || '');
    const paymentsForBill = pPaymentsByInv.get(billNo);

    if (paymentsForBill && paymentsForBill.length > 0) {
      // an older bill's first payment has no record: it counts too
      withUntrackedPurchaseInitial(bill, paymentsForBill).forEach((p) => {
        const amt = toNum(p.amount);
        if (p.paymentMethod === 'cash') {
          cashBalance -= amt;
          cashOutflows += amt;
        } else {
          const targetBankId = p.bankAccountId || bill.bankAccountId || Object.keys(bankMap)[0];
          if (targetBankId && bankMap[targetBankId]) {
            bankMap[targetBankId].currentBalance -= amt;
            bankMap[targetBankId].outflows += amt;
          }
        }
      });
    } else {
      const pay = bill.payment || bill.paymentBreakdown || {};
      const cashPaid = toNum(pay.cash || (bill.paymentMethod === 'cash' ? bill.amountPaid : 0));
      const upiPaid = toNum(pay.upi || (bill.paymentMethod === 'upi' ? bill.amountPaid : 0));
      const accPaid = toNum(pay.account || (bill.paymentMethod === 'account' ? bill.amountPaid : 0));

      if (cashPaid > 0) {
        cashBalance -= cashPaid;
        cashOutflows += cashPaid;
      }

      const targetBankId = bill.bankAccountId || Object.keys(bankMap)[0];
      const bankOutflow = upiPaid + accPaid;
      if (bankOutflow > 0 && targetBankId && bankMap[targetBankId]) {
        bankMap[targetBankId].currentBalance -= bankOutflow;
        bankMap[targetBankId].outflows += bankOutflow;
      }
    }
  });

  // 4. Operating Expenses
  expenses.forEach((exp) => {
    const amt = toNum(exp.amount);
    const source = exp.paymentSource || 'cash';
    if (source === 'cash') {
      cashBalance -= amt;
      cashOutflows += amt;
    } else if (bankMap[source]) {
      bankMap[source].currentBalance -= amt;
      bankMap[source].outflows += amt;
    } else {
      cashBalance -= amt;
      cashOutflows += amt;
    }
  });

  // 5. Account Transfers (Manual Inflows / Outflows / Internal transfers)
  accountTransactions.forEach((tx) => {
    const amt = toNum(tx.amount);
    const from = tx.fromAccount; // 'cash' or bankId
    const to = tx.toAccount; // 'cash' or bankId

    // Debit 'from'
    if (from === 'cash') {
      cashBalance -= amt;
      cashOutflows += amt;
    } else if (bankMap[from]) {
      bankMap[from].currentBalance -= amt;
      bankMap[from].outflows += amt;
    }

    // Credit 'to'
    if (to === 'cash') {
      cashBalance += amt;
      cashInflows += amt;
    } else if (bankMap[to]) {
      bankMap[to].currentBalance += amt;
      bankMap[to].inflows += amt;
    }
  });

  // 6. Returns (Direct Cash / Bank Refunds)
  (salesReturns || []).forEach((r) => {
    if (r.settlementType === 'refund' || r.refundMethod) {
      const amt = toNum(r.returnAmount || r.amount);
      if (amt <= 0) return;
      if (r.refundMethod === 'cash') {
        cashBalance -= amt;
        cashOutflows += amt;
      } else {
        const targetBankId = r.bankAccountId || Object.keys(bankMap)[0];
        if (targetBankId && bankMap[targetBankId]) {
          bankMap[targetBankId].currentBalance -= amt;
          bankMap[targetBankId].outflows += amt;
        }
      }
    }
  });

  (purchaseReturns || []).forEach((r) => {
    if (r.settlementType === 'refund' || r.refundMethod) {
      const amt = toNum(r.returnAmount || r.amount);
      if (amt <= 0) return;
      if (r.refundMethod === 'cash') {
        cashBalance += amt;
        cashInflows += amt;
      } else {
        const targetBankId = r.bankAccountId || Object.keys(bankMap)[0];
        if (targetBankId && bankMap[targetBankId]) {
          bankMap[targetBankId].currentBalance += amt;
          bankMap[targetBankId].inflows += amt;
        }
      }
    }
  });

  const computedBanks = Object.values(bankMap);
  const totalBankBalance = computedBanks.reduce((sum, b) => sum + b.currentBalance, 0);
  const totalAvailableFunds = totalBankBalance + cashBalance;

  return {
    bankAccounts: computedBanks,
    cashAccount: {
      id: 'cash',
      name: 'Cash in Hand',
      openingBalance: toNum(cashOpening),
      currentBalance: cashBalance,
      inflows: cashInflows,
      outflows: cashOutflows,
    },
    totalBankBalance,
    cashBalance,
    totalAvailableFunds,
  };
}

/**
 * Loads all related financial collections from db (using memory cache when available)
 * and computes live account balances. STRICT: a failed read throws (a balance built from a partial read would look
 * real), so callers must catch and show an error / unknown state.
 */
export async function loadLiveAccountBalances() {
  const [banks, cash, sales, purchases, exps, fin, txs, sPayments, pPayments, sReturns, pReturns] =
    await Promise.all([
      db.getAllBankAccounts(),
      db.getCashSettings(),
      db.getAllInvoices(),
      db.getAllPurchaseBills(),
      db.getAllExpenses(),
      db.getAllFinanceRecords(),
      db.getAllAccountTransactions(),
      db.getAllPayments(),
      db.getAllPurchasePayments(),
      db.getAllReturns(),
      db.getAllPurchaseReturns(),
    ]);

  return computeAccountBalances({
    bankAccounts: banks || [],
    cashOpening: cash?.openingBalance || 0,
    salesInvoices: sales || [],
    purchaseBills: purchases || [],
    expenses: exps || [],
    financeRecords: fin || [],
    accountTransactions: txs || [],
    salesPayments: sPayments || [],
    purchasePayments: pPayments || [],
    salesReturns: sReturns || [],
    purchaseReturns: pReturns || [],
  });
}

/**
 * How many records use bank account `account`: everything its balance is built from (getAccountActivity, including
 * older records without a bank that fall back to the first account) plus every record that names it (bills, payment
 * records, returns, entries, expenses, loans and their repayments, lot / batch payments). Deleting a used account
 * would move or drop those amounts, so it must stay. `data` = the getAccountActivity collections plus optional
 * `processingLots`, `dyeingBatches`, `combingBatches`.
 */
export function countAccountReferences(account, data = {}) {
  const id = account?.id;
  if (!id || id === 'cash') return 0;
  const refs = new Set();
  getAccountActivity({ account, ...data }).items.forEach((item) => refs.add(item.sourceRef ?? item.id));
  const names = (...values) => values.includes(id);
  const scan = (list, test) => (list || []).forEach((r) => r && test(r) && refs.add(r));
  scan(data.salesInvoices, (r) => names(r.bankAccountId));
  scan(data.purchaseBills, (r) => names(r.bankAccountId, r.payment?.bankAccountId));
  scan(data.salesPayments, (r) => names(r.bankAccountId));
  scan(data.purchasePayments, (r) => names(r.bankAccountId));
  scan(data.salesReturns, (r) => names(r.bankAccountId));
  scan(data.purchaseReturns, (r) => names(r.bankAccountId));
  scan(data.accountTransactions, (r) => names(r.fromAccount, r.toAccount, r.bankAccountId));
  scan(data.expenses, (r) => names(r.paymentSource));
  (data.financeRecords || []).forEach((rec) => {
    if (names(rec.depositAccount)) refs.add(rec);
    scan(rec.payments, (p) => names(p.sourceAccount));
  });
  // a lot / batch payment and its account_transactions copy (same id) are one payment
  const mirrored = new Set((data.accountTransactions || []).map((t) => t.id));
  const lotPayment = (p) => names(p.bankAccountId) && !mirrored.has(p.id);
  (data.processingLots || []).forEach((lot) => {
    scan(lot.dyeingPayments, lotPayment);
    scan(lot.combingPayments, lotPayment);
  });
  [...(data.dyeingBatches || []), ...(data.combingBatches || [])].forEach((batch) =>
    scan(batch.payments, lotPayment),
  );
  return refs.size;
}

/**
 * Every collection that can name a bank account, for countAccountReferences. No `.catch(() => [])` here (returns read
 * strictly too): a failed read throws, so an account is not deleted on a partial picture.
 */
export async function loadAccountReferenceData() {
  const [
    bankAccounts,
    salesInvoices,
    purchaseBills,
    expenses,
    financeRecords,
    accountTransactions,
    salesPayments,
    purchasePayments,
    salesReturns,
    purchaseReturns,
    processingLots,
    dyeingBatches,
    combingBatches,
  ] = await Promise.all([
    db.getAllBankAccounts(),
    db.getAllInvoices(),
    db.getAllPurchaseBills(),
    db.getAllExpenses(),
    db.getAllFinanceRecords(),
    db.getAllAccountTransactions(),
    db.getAllPayments(),
    db.getAllPurchasePayments(),
    db.getAllReturns({ strict: true }),
    db.getAllPurchaseReturns(),
    db.getAllProcessingLots(),
    db.getAllDyeingBatches(),
    db.getAllCombingBatches(),
  ]);
  return {
    bankAccounts: bankAccounts || [],
    salesInvoices: salesInvoices || [],
    purchaseBills: purchaseBills || [],
    expenses: expenses || [],
    financeRecords: financeRecords || [],
    accountTransactions: accountTransactions || [],
    salesPayments: salesPayments || [],
    purchasePayments: purchasePayments || [],
    salesReturns: salesReturns || [],
    purchaseReturns: purchaseReturns || [],
    processingLots: processingLots || [],
    dyeingBatches: dyeingBatches || [],
    combingBatches: combingBatches || [],
  };
}

/**
 * Extracts a reliable epoch millisecond timestamp from an item or record.
 */
export function getRecordTimestamp(ref, fallbackDateStr) {
  if (!ref) {
    if (fallbackDateStr) {
      const d = new Date(fallbackDateStr);
      return !isNaN(d.getTime()) ? d.getTime() : 0;
    }
    return 0;
  }

  // 1. If ref has createdAt or updatedAt or timestamp
  const created = ref.createdAt || ref.timestamp || ref.updatedAt;
  if (created) {
    if (typeof created === 'number') return created;
    if (typeof created.toDate === 'function') return created.toDate().getTime();
    if (created.seconds)
      return created.seconds * 1000 + (created.nanoseconds ? created.nanoseconds / 1e6 : 0);
    const d = new Date(created);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // 2. Extract numeric millisecond timestamp from id if present (e.g. payment_1791888878195_..., uid('payment'))
  const idStr = String(ref.id || ref._id || '');
  const tsMatch = idStr.match(/(?:payment_|invoice_|tx_|bill_|ret_|exp_)?(\d{13})/);
  if (tsMatch) {
    const num = parseInt(tsMatch[1], 10);
    if (num > 1577836800000 && num < 2524608000000) {
      return num;
    }
  }

  // 3. Fallback to fallbackDateStr or ref.date / ref.paymentDate / ref.invoiceDate
  const dateVal =
    fallbackDateStr || ref.paymentDate || ref.date || ref.invoiceDate || ref.billDate || ref.startDate;
  if (dateVal) {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  return 0;
}

/**
 * Normalizes a date into a sortable YYYY-MM-DD string key.
 */
export function toDateKey(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(val);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(val);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
  }
  const d = val instanceof Date ? val : new Date(val);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(val);
}

/**
 * Extracts and itemizes every single inflow and outflow transaction for a specific account.
 */
export function getAccountActivity({
  account,
  salesInvoices = [],
  purchaseBills = [],
  expenses = [],
  financeRecords = [],
  accountTransactions = [],
  bankAccounts = [],
  salesPayments = [],
  purchasePayments = [],
  salesReturns = [],
  purchaseReturns = [],
}) {
  if (!account)
    return {
      items: [],
      openingBalance: 0,
      totalInflows: 0,
      totalOutflows: 0,
      computedCurrentBalance: 0,
      breakdown: {},
    };

  const isCash = account.id === 'cash';
  const accountId = account.id;
  const items = [];

  const bankNameMap = {};
  bankAccounts.forEach((b) => {
    bankNameMap[b.id] = accountLabel(b);
  });
  bankNameMap['cash'] = CASH_LABEL;

  // 1. Sales Invoices & Payments
  const sPaymentsByInv = new Map();
  (salesPayments || []).forEach((p) => {
    if (!p.invoiceNo) return;
    const invNo = String(p.invoiceNo);
    if (!sPaymentsByInv.has(invNo)) sPaymentsByInv.set(invNo, []);
    sPaymentsByInv.get(invNo).push(p);
  });

  salesInvoices.forEach((inv) => {
    const invDate = inv.invoiceDate || inv.date || inv.createdAt;
    const invNo = inv.invoiceNo || inv.billNo || 'Inv';
    const customer = inv.customerName || inv.partyName || 'Customer';
    const paymentsForInv = sPaymentsByInv.get(String(invNo));
    const invTs = getRecordTimestamp(inv, invDate);

    if (paymentsForInv && paymentsForInv.length > 0) {
      // an older invoice's first payment has no record: it is listed too (dated the invoice date)
      withUntrackedSalesInitial(inv, paymentsForInv).forEach((p) => {
        const amt = toNum(p.amount);
        const pDate = p.paymentDate || invDate;
        const pTs = getRecordTimestamp(p, pDate) || invTs;
        if (isCash && p.paymentMethod === 'cash') {
          if (amt > 0) {
            items.push({
              id: `sale-pay-${p.id || invNo}-${p.paymentMethod}`,
              date: pDate,
              timestamp: pTs,
              type: p.paymentType === 'additional' ? 'Payment Received (Cash)' : 'Sale (Cash)',
              direction: 'in',
              category: 'Sales',
              amount: amt,
              title: `Sales ${invoiceNoLabel(invNo)}`,
              subtitle: `Customer: ${customer} • ${p.paymentType === 'additional' ? 'Additional Payment' : 'Initial Payment'}`,
              sourceRef: p.untracked ? inv : p,
            });
          }
        } else if (!isCash) {
          const targetBankId = p.bankAccountId || inv.bankAccountId || bankAccounts[0]?.id;
          if (targetBankId === accountId && p.paymentMethod !== 'cash') {
            if (amt > 0) {
              items.push({
                id: `sale-pay-${p.id || invNo}-${p.paymentMethod}`,
                date: pDate,
                timestamp: pTs,
                type: 'Sale (Account)',
                direction: 'in',
                category: 'Sales',
                amount: amt,
                title: `Sales ${invoiceNoLabel(invNo)}`,
                subtitle: `Customer: ${customer} • Account`,
                sourceRef: p.untracked ? inv : p,
              });
            }
          }
        }
      });
    } else {
      // Fallback: Invoice level breakdown
      if (isCash) {
        const cashAmt = toNum(
          inv.paymentBreakdown?.cash || (inv.paymentMethod === 'cash' ? inv.amountPaid : 0),
        );
        if (cashAmt > 0) {
          items.push({
            id: `sale-${inv.id || invNo}-cash`,
            date: invDate,
            timestamp: invTs,
            type: 'Sale (Cash)',
            direction: 'in',
            category: 'Sales',
            amount: cashAmt,
            title: `Sales ${invoiceNoLabel(invNo)}`,
            subtitle: `Customer: ${customer}`,
            sourceRef: inv,
          });
        }
      } else {
        const targetBankId = inv.bankAccountId || bankAccounts[0]?.id;
        if (targetBankId === accountId) {
          // legacy invoices may carry a separate `upi` amount: it is Account money too
          const upiPaid = toNum(
            inv.paymentBreakdown?.upi || (inv.paymentMethod === 'upi' ? inv.amountPaid : 0),
          );
          const accPaid = toNum(
            inv.paymentBreakdown?.account || (inv.paymentMethod === 'account' ? inv.amountPaid : 0),
          );
          const totalBank = upiPaid + accPaid;
          if (totalBank > 0) {
            items.push({
              id: `sale-${inv.id || invNo}-bank`,
              date: invDate,
              timestamp: invTs,
              type: 'Sale (Account)',
              direction: 'in',
              category: 'Sales',
              amount: totalBank,
              title: `Sales ${invoiceNoLabel(invNo)}`,
              subtitle: `Customer: ${customer}`,
              sourceRef: inv,
            });
          }
        }
      }
    }
  });

  // 2. Purchase Bills & Payments
  const pPaymentsByInv = new Map();
  (purchasePayments || []).forEach((p) => {
    if (!p.invoiceNo) return;
    const invNo = String(p.invoiceNo);
    if (!pPaymentsByInv.has(invNo)) pPaymentsByInv.set(invNo, []);
    pPaymentsByInv.get(invNo).push(p);
  });

  purchaseBills.forEach((bill) => {
    // purchase bills store `invoiceDate`; `createdAt` is stamped again on every save
    const billDate = bill.invoiceDate || bill.billDate || bill.date || bill.createdAt;
    const billNo = bill.billNumber || bill.invoiceNo || 'Bill';
    const supplier = bill.supplierName || bill.partyName || 'Supplier';
    const paymentsForBill = pPaymentsByInv.get(String(billNo));
    const billTs = getRecordTimestamp(bill, billDate);

    if (paymentsForBill && paymentsForBill.length > 0) {
      // an older bill's first payment has no record: it is listed too (dated the bill date)
      withUntrackedPurchaseInitial(bill, paymentsForBill).forEach((p) => {
        const amt = toNum(p.amount);
        const pDate = p.paymentDate || billDate;
        const pTs = getRecordTimestamp(p, pDate) || billTs;
        if (isCash && p.paymentMethod === 'cash') {
          if (amt > 0) {
            items.push({
              id: `purch-pay-${p.id || billNo}-${p.paymentMethod}`,
              date: pDate,
              timestamp: pTs,
              type: p.paymentType === 'additional' ? 'Supplier Payment (Cash)' : 'Purchase (Cash)',
              direction: 'out',
              category: 'Purchase',
              amount: amt,
              title: `Purchase ${invoiceNoLabel(billNo)}`,
              subtitle: `Supplier: ${supplier} • ${p.paymentType === 'additional' ? 'Additional Payment' : 'Initial Payment'}`,
              sourceRef: p.untracked ? bill : p,
            });
          }
        } else if (!isCash) {
          const targetBankId = p.bankAccountId || bill.bankAccountId || bankAccounts[0]?.id;
          if (targetBankId === accountId && p.paymentMethod !== 'cash') {
            if (amt > 0) {
              items.push({
                id: `purch-pay-${p.id || billNo}-${p.paymentMethod}`,
                date: pDate,
                timestamp: pTs,
                type: 'Purchase (Account)',
                direction: 'out',
                category: 'Purchase',
                amount: amt,
                title: `Purchase ${invoiceNoLabel(billNo)}`,
                subtitle: `Supplier: ${supplier} • Account`,
                sourceRef: p.untracked ? bill : p,
              });
            }
          }
        }
      });
    } else {
      const pay = bill.payment || bill.paymentBreakdown || {};
      if (isCash) {
        const cashAmt = toNum(pay.cash || (bill.paymentMethod === 'cash' ? bill.amountPaid : 0));
        if (cashAmt > 0) {
          items.push({
            id: `purchase-${bill.id || billNo}-cash`,
            date: billDate,
            timestamp: billTs,
            type: 'Purchase (Cash)',
            direction: 'out',
            category: 'Purchase',
            amount: cashAmt,
            title: `Purchase ${invoiceNoLabel(billNo)}`,
            subtitle: `Supplier: ${supplier}`,
            sourceRef: bill,
          });
        }
      } else {
        const targetBankId = bill.bankAccountId || bankAccounts[0]?.id;
        if (targetBankId === accountId) {
          // legacy bills may carry a separate `upi` amount: it is Account money too
          const upiPaid = toNum(pay.upi || (bill.paymentMethod === 'upi' ? bill.amountPaid : 0));
          const accPaid = toNum(pay.account || (bill.paymentMethod === 'account' ? bill.amountPaid : 0));
          const totalBank = upiPaid + accPaid;
          if (totalBank > 0) {
            items.push({
              id: `purchase-${bill.id || billNo}-bank`,
              date: billDate,
              timestamp: billTs,
              type: 'Purchase (Account)',
              direction: 'out',
              category: 'Purchase',
              amount: totalBank,
              title: `Purchase ${invoiceNoLabel(billNo)}`,
              subtitle: `Supplier: ${supplier}`,
              sourceRef: bill,
            });
          }
        }
      }
    }
  });

  // 3. Operating Expenses
  expenses.forEach((exp) => {
    const amt = toNum(exp.amount);
    const expDate = exp.date || exp.createdAt;
    const source = exp.paymentSource || 'cash';
    const expTs = getRecordTimestamp(exp, expDate);

    if ((isCash && source === 'cash') || (!isCash && source === accountId)) {
      items.push({
        id: `exp-${exp.id}`,
        date: expDate,
        timestamp: expTs,
        type: 'Business Expense',
        direction: 'out',
        category: 'Expense',
        amount: amt,
        title: `Expense: ${exp.reason || exp.category || exp.title || 'General Expense'}`,
        subtitle: exp.description || exp.notes || 'Operating expense',
        sourceRef: exp,
      });
    }
  });

  // 4. Finance Loan Borrowings (Received into this account)
  financeRecords.forEach((rec) => {
    const principal = toNum(rec.principal);
    const dest = rec.depositAccount || 'cash';
    const lender = rec.lenderName || 'Lender';
    const loanTs = getRecordTimestamp(rec, rec.startDate);

    if ((isCash && dest === 'cash') || (!isCash && dest === accountId)) {
      items.push({
        id: `fin-loan-${rec.id}`,
        date: rec.startDate,
        timestamp: loanTs,
        type: 'Loan Received',
        direction: 'in',
        category: 'Finance',
        amount: principal,
        title: `Loan Inflow: ${lender}`,
        subtitle: `Interest rate: ${rec.rate}% / mo`,
        sourceRef: rec,
      });
    }

    // 5. Finance Loan Repayments (Paid out of this account)
    (rec.payments || []).forEach((p, idx) => {
      const pAmt = toNum(p.amount);
      const source = p.sourceAccount || (p.mode === 'Cash' ? 'cash' : bankAccounts[0]?.id || 'cash');
      const pTs = getRecordTimestamp(p, p.date) || loanTs;

      if ((isCash && source === 'cash') || (!isCash && source === accountId)) {
        items.push({
          id: `fin-pay-${rec.id}-${idx}`,
          date: p.date,
          timestamp: pTs,
          type: 'Loan Repayment',
          direction: 'out',
          category: 'Finance',
          amount: pAmt,
          title: `Loan Repayment: ${lender}`,
          // legacy 'UPI' loan payments read as Account (the money left `source` either way)
          subtitle: p.notes || `Mode: ${source === 'cash' ? 'Cash' : 'Account'}`,
          sourceRef: p,
          // older loan payments have no id: Undo finds them by their loan and position
          recordId: rec.id,
          paymentIndex: idx,
        });
      }
    });
  });

  // 6. Entries (Add Amount / Deduction / Edit Balance, dyeing & combing payments) and legacy fund transfers
  accountTransactions.forEach((tx) => {
    const amt = toNum(tx.amount);
    const from = tx.fromAccount;
    const to = tx.toAccount;
    const txDate = tx.date || tx.createdAt;
    const txTs = getRecordTimestamp(tx, txDate);
    const isBalanceEdit = tx.type === BALANCE_ADJUSTMENT;
    const balanceEditSubtitle = isBalanceEdit
      ? `₹${toNum(tx.previousBalance)} → ₹${toNum(tx.newBalance)}${tx.notes ? ` • ${tx.notes}` : ''}`
      : '';

    // Outflow from this account
    if (from === accountId) {
      const isManualDebit = isExternalAccount(to);
      const destName = bankNameMap[to] || (to === 'cash' ? CASH_LABEL : 'Bank Account');
      items.push({
        id: `tx-out-${tx.id}`,
        date: txDate,
        timestamp: txTs,
        type: tx.type || (isManualDebit ? 'Manual Deduction' : 'Internal Transfer Out'),
        direction: 'out',
        category: tx.category || (isManualDebit ? 'Adjustment' : 'Transfer'),
        amount: amt,
        title: isBalanceEdit
          ? 'Cash Balance Edited'
          : isManualDebit
            ? tx.category
              ? `Deduction: ${tx.category}`
              : 'Deduction'
            : `Transferred to ${destName}`,
        subtitle: isBalanceEdit
          ? balanceEditSubtitle
          : tx.notes || (isManualDebit ? 'Manual deduction from account' : 'Internal fund transfer'),
        sourceRef: tx,
      });
    }

    // Inflow to this account
    if (to === accountId) {
      const isManualCredit = isExternalAccount(from);
      const srcName = bankNameMap[from] || (from === 'cash' ? CASH_LABEL : 'Bank Account');
      items.push({
        id: `tx-in-${tx.id}`,
        date: txDate,
        timestamp: txTs,
        type: tx.type || (isManualCredit ? 'Additional Amount' : 'Internal Transfer In'),
        direction: 'in',
        category: tx.category || (isManualCredit ? 'Adjustment' : 'Transfer'),
        amount: amt,
        title: isBalanceEdit
          ? 'Cash Balance Edited'
          : isManualCredit
            ? tx.category
              ? `Additional Amount: ${tx.category}`
              : 'Additional Amount'
            : `Received from ${srcName}`,
        subtitle: isBalanceEdit
          ? balanceEditSubtitle
          : tx.notes || (isManualCredit ? 'Manual amount added to account' : 'Internal fund transfer'),
        sourceRef: tx,
      });
    }
  });

  // 7. Returns (Direct Cash / Bank Refunds)
  (salesReturns || []).forEach((r) => {
    if (r.settlementType === 'refund' || r.refundMethod) {
      const amt = toNum(r.returnAmount || r.amount);
      if (amt <= 0) return;
      const rDate = r.returnDate || r.date || r.createdAt;
      const rTs = getRecordTimestamp(r, rDate);
      if (isCash && r.refundMethod === 'cash') {
        items.push({
          id: `sale-ret-${r.id || r.invoiceNo}`,
          date: rDate,
          timestamp: rTs,
          type: 'Sales Return (Cash Refund)',
          direction: 'out',
          category: 'Returns',
          amount: amt,
          title: `Sales Return Refund - ${invoiceNoLabel(r.invoiceNo)}`,
          subtitle: `Customer: ${r.customerName || 'Customer'} • ${r.description || 'Goods returned'}`,
          sourceRef: r,
        });
      } else if (!isCash) {
        const targetBankId = r.bankAccountId || bankAccounts[0]?.id;
        if (targetBankId === accountId && r.refundMethod !== 'cash') {
          items.push({
            id: `sale-ret-${r.id || r.invoiceNo}`,
            date: rDate,
            timestamp: rTs,
            type: 'Sales Return (Bank Refund)',
            direction: 'out',
            category: 'Returns',
            amount: amt,
            title: `Sales Return Refund - ${invoiceNoLabel(r.invoiceNo)}`,
            subtitle: `Customer: ${r.customerName || 'Customer'} • ${r.description || 'Goods returned'}`,
            sourceRef: r,
          });
        }
      }
    }
  });

  (purchaseReturns || []).forEach((r) => {
    if (r.settlementType === 'refund' || r.refundMethod) {
      const amt = toNum(r.returnAmount || r.amount);
      if (amt <= 0) return;
      const rDate = r.returnDate || r.date || r.createdAt;
      const rTs = getRecordTimestamp(r, rDate);
      if (isCash && r.refundMethod === 'cash') {
        items.push({
          id: `purch-ret-${r.id || r.invoiceNo}`,
          date: rDate,
          timestamp: rTs,
          type: 'Purchase Return (Cash Refund)',
          direction: 'in',
          category: 'Returns',
          amount: amt,
          title: `Purchase Return Refund - ${invoiceNoLabel(r.invoiceNo)}`,
          subtitle: `Supplier: ${r.supplierName || 'Supplier'} • ${r.description || 'Goods returned'}`,
          sourceRef: r,
        });
      } else if (!isCash) {
        const targetBankId = r.bankAccountId || bankAccounts[0]?.id;
        if (targetBankId === accountId && r.refundMethod !== 'cash') {
          items.push({
            id: `purch-ret-${r.id || r.invoiceNo}`,
            date: rDate,
            timestamp: rTs,
            type: 'Purchase Return (Bank Refund)',
            direction: 'in',
            category: 'Returns',
            amount: amt,
            title: `Purchase Return Refund - ${invoiceNoLabel(r.invoiceNo)}`,
            subtitle: `Supplier: ${r.supplierName || 'Supplier'} • ${r.description || 'Goods returned'}`,
            sourceRef: r,
          });
        }
      }
    }
  });

  // Sort by date and recency descending (most recent first at top)
  items.sort((a, b) => {
    const dateStrA = toDateKey(a.date);
    const dateStrB = toDateKey(b.date);

    // 1. Calendar date descending
    if (dateStrB !== dateStrA) {
      return dateStrB.localeCompare(dateStrA);
    }

    // 2. Exact timestamp descending (more recent at top)
    const timeB = b.timestamp || 0;
    const timeA = a.timestamp || 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }

    // 3. Fallback tie breaker by id descending
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  // Compute breakdown stats
  const totalInflows = items.filter((i) => i.direction === 'in').reduce((sum, i) => sum + i.amount, 0);

  const totalOutflows = items.filter((i) => i.direction === 'out').reduce((sum, i) => sum + i.amount, 0);

  const salesInflow = items
    .filter((i) => i.direction === 'in' && i.category === 'Sales')
    .reduce((sum, i) => sum + i.amount, 0);

  const loanInflow = items
    .filter((i) => i.direction === 'in' && i.type === 'Loan Received')
    .reduce((sum, i) => sum + i.amount, 0);

  const transferInflow = items
    .filter(
      (i) =>
        i.direction === 'in' &&
        (i.type?.includes('Transfer In') ||
          (i.category === 'Transfer' &&
            i.sourceRef?.fromAccount &&
            i.sourceRef.fromAccount !== 'external' &&
            i.sourceRef.fromAccount !== 'manual')),
    )
    .reduce((sum, i) => sum + i.amount, 0);

  const additionalInflow = items
    .filter(
      (i) =>
        i.direction === 'in' &&
        (i.type === 'Additional Amount' ||
          (i.category !== 'Sales' &&
            i.category !== 'Returns' &&
            i.type !== 'Loan Received' &&
            (!i.sourceRef?.fromAccount ||
              i.sourceRef.fromAccount === 'external' ||
              i.sourceRef.fromAccount === 'manual'))),
    )
    .reduce((sum, i) => sum + i.amount, 0);

  const purchaseReturnInflow = items
    .filter((i) => i.direction === 'in' && i.category === 'Returns')
    .reduce((sum, i) => sum + i.amount, 0);

  const purchaseOutflow = items
    .filter((i) => i.direction === 'out' && i.category === 'Purchase')
    .reduce((sum, i) => sum + i.amount, 0);

  const expenseOutflow = items
    .filter((i) => i.direction === 'out' && i.category === 'Expense')
    .reduce((sum, i) => sum + i.amount, 0);

  const loanRepayOutflow = items
    .filter((i) => i.direction === 'out' && i.type === 'Loan Repayment')
    .reduce((sum, i) => sum + i.amount, 0);

  const transferOutflow = items
    .filter(
      (i) =>
        i.direction === 'out' &&
        (i.type?.includes('Transfer Out') ||
          (i.category === 'Transfer' &&
            i.sourceRef?.toAccount &&
            i.sourceRef.toAccount !== 'external' &&
            i.sourceRef.toAccount !== 'manual')),
    )
    .reduce((sum, i) => sum + i.amount, 0);

  const manualDeductionOutflow = items
    .filter(
      (i) =>
        i.direction === 'out' &&
        (i.type === 'Manual Deduction' ||
          (i.category !== 'Purchase' &&
            i.category !== 'Expense' &&
            i.category !== 'Returns' &&
            i.type !== 'Loan Repayment' &&
            (!i.sourceRef?.toAccount ||
              i.sourceRef.toAccount === 'external' ||
              i.sourceRef.toAccount === 'manual'))),
    )
    .reduce((sum, i) => sum + i.amount, 0);

  const salesReturnOutflow = items
    .filter((i) => i.direction === 'out' && i.category === 'Returns')
    .reduce((sum, i) => sum + i.amount, 0);

  const openingBalance = toNum(account.openingBalance);
  const computedCurrentBalance = openingBalance + totalInflows - totalOutflows;

  return {
    items,
    openingBalance,
    totalInflows,
    totalOutflows,
    computedCurrentBalance,
    breakdown: {
      salesInflow,
      loanInflow,
      transferInflow,
      additionalInflow,
      purchaseReturnInflow,
      purchaseOutflow,
      expenseOutflow,
      loanRepayOutflow,
      transferOutflow,
      manualDeductionOutflow,
      salesReturnOutflow,
    },
  };
}
