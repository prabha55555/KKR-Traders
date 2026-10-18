/**
 * Everything the printed / shared invoice and the WhatsApp invoice statement show besides the bill itself: its returns,
 * payment documents and bank names. Paid and due amounts are the STORED ones (the ledger keeps them right, including
 * an older bill's initial payment that has no payment document); payment documents only decide the Cash / Account
 * split and the payment list.
 */
import { accountLabel, accountLabelWithBank } from '@/core/accountLabel';
import { db } from '@/core/db';
import { toNum } from '@/core/format';
import { balanceReturnsTotal, roundMoney } from '@/core/ledger';
import { foldBreakdown, normalizeMethod, sumByMethod } from '@/core/paymentMethods';

/**
 * The bill's `{ cash, account }` split. Payment documents win when they add up to the stored amount paid; otherwise the
 * stored breakdown when it does; otherwise the documents plus the untracked rest as cash (like the edit form).
 * No documents: the stored breakdown (folded), or null for a very old bill that only has a single `paymentMethod`.
 */
export function resolvePaymentSplit(invoice, payments) {
  const stored = foldBreakdown(invoice.paymentBreakdown);
  if (!payments?.length) return stored;
  const amountPaid = toNum(invoice.amountPaid);
  const docs = sumByMethod(payments);
  const untracked = roundMoney(amountPaid - docs.cash - docs.account);
  if (Math.abs(untracked) < 0.005) return docs;
  if (stored && Math.abs(stored.cash + stored.account - amountPaid) < 0.005) return stored;
  return { cash: docs.cash + Math.max(0, untracked), account: docs.account };
}

/** Loads the invoice's returns, payments and bank accounts and resolves the figures the invoice outputs print. */
export async function loadInvoiceContext(invoice) {
  const invoiceNo = invoice.invoiceNo;
  const [returns, rawPayments, bankAccounts] = await Promise.all([
    db.getReturnsByInvoice(invoiceNo).catch(() => []),
    db.getPaymentsByInvoice(invoiceNo).catch(() => []),
    db.getAllBankAccounts().catch(() => []),
  ]);
  const bankMap = new Map((bankAccounts || []).map((b) => [b.id, b]));
  const defaultBank = bankAccounts?.[0];

  const payments = (rawPayments || []).map((p) => {
    const isAccount = normalizeMethod(p.paymentMethod) === 'account';
    const bank = p.bankAccountId ? bankMap.get(p.bankAccountId) : isAccount ? defaultBank : null;
    return { ...p, bankAccountName: bank ? accountLabelWithBank(bank) : '' };
  });

  const pb = resolvePaymentSplit(invoice, payments);

  let accountBankName = '';
  const bankForInvoice = invoice.bankAccountId ? bankMap.get(invoice.bankAccountId) : null;
  if (bankForInvoice) {
    accountBankName = accountLabel(bankForInvoice);
  } else {
    const accPayment = payments.find(
      (p) => normalizeMethod(p.paymentMethod) === 'account' && bankMap.get(p.bankAccountId),
    );
    if (accPayment) {
      accountBankName = accountLabel(bankMap.get(accPayment.bankAccountId));
    } else if (
      defaultBank &&
      (pb?.account > 0 || (invoice.paymentMethod && normalizeMethod(invoice.paymentMethod) === 'account'))
    ) {
      accountBankName = accountLabel(defaultBank);
    }
  }

  const amountPaid = toNum(invoice.amountPaid);
  const balanceDue =
    invoice.balanceDue !== undefined && invoice.balanceDue !== null
      ? toNum(invoice.balanceDue)
      : toNum(invoice.grandTotal) - amountPaid;
  const totalReturns = roundMoney((returns || []).reduce((sum, r) => sum + toNum(r.returnAmount), 0));
  // only returns settled against the balance lower the due; cash / bank refunds are listed but change nothing
  const balanceReturns = balanceReturnsTotal(returns);

  return {
    invoice: { ...invoice, paymentBreakdown: pb, amountPaid, balanceDue },
    returns: returns || [],
    totalReturns,
    balanceReturns,
    adjustedBalanceDue: roundMoney(balanceDue - balanceReturns),
    payments,
    accountBankName,
  };
}
