/**
 * The app has exactly two payment methods: Cash and Account (bank transfer, UPI, cheque … all go to a bank account).
 * Older documents may still say 'upi' / 'gpay' / 'bank' (or a split with an `upi` amount): they are read as Account
 * everywhere through these helpers. Nothing is rewritten in Firestore; a bill saved again is stored in the new shape.
 */
import { toNum } from './format';

export const PAYMENT_METHODS = ['cash', 'account'];

/** 'cash' or 'account'. UPI / GPay / bank / account are all Account; empty or unknown is Cash (as before). */
export function normalizeMethod(method) {
  const m = String(method ?? '')
    .trim()
    .toLowerCase();
  if (m === 'upi' || m === 'gpay' || m === 'g-pay' || m === 'phonepe' || m === 'paytm') return 'account';
  if (m === 'account' || m === 'bank' || m === 'neft' || m === 'rtgs' || m === 'imps') return 'account';
  return 'cash';
}

/** `{ cash, account }` from a stored split that may carry a legacy `upi` amount (null stays null). */
export function foldBreakdown(pb) {
  if (!pb || typeof pb !== 'object') return null;
  return { cash: toNum(pb.cash), account: toNum(pb.account) + toNum(pb.upi) };
}

/** A purchase bill's nested `payment` object with any legacy `upi` amount moved into `account` (other keys kept). */
export function foldPurchasePayment(payment) {
  if (!payment || typeof payment !== 'object') return payment;
  const { upi, ...rest } = payment;
  return { ...rest, cash: toNum(payment.cash), account: toNum(payment.account) + toNum(upi) };
}

/** Display label of a method: 'Cash' or 'Account'. */
export const methodLabel = (method) => (normalizeMethod(method) === 'cash' ? 'Cash' : 'Account');

/**
 * Display label of the `mode` strings stored on dyeing / combing / loan payments ('Cash' | 'Bank' | 'UPI' |
 * 'Account'): anything but Cash is Account.
 */
export const modeLabel = (mode) =>
  !mode || String(mode).trim().toLowerCase() === 'cash' ? 'Cash' : 'Account';

/** Totals per method of payment documents: `{ cash, account }` (legacy UPI / bank documents count as Account). */
export function sumByMethod(payments) {
  return (payments || []).reduce(
    (acc, p) => {
      acc[normalizeMethod(p.paymentMethod)] += toNum(p.amount);
      return acc;
    },
    { cash: 0, account: 0 },
  );
}
