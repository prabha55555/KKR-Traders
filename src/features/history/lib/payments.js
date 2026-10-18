/** Payment-side pure logic: input validation, record timestamps, summaries, the statement's payment table. */
import { formatCurrency, formatDateIN, toNum } from '@/core/format';
import { dateMillis, timeOfDay } from './dates';
import { sumPaymentAmounts } from './lookups';
export const totalOf = (a) => a.cash + a.upi + a.account;
export function parsePaymentAmounts(values) {
  return { cash: toNum(values.cash), upi: toNum(values.upi), account: toNum(values.account) };
}
/** addPayment() confirm handler: amount first, then date (same order and wording as the web dialog). */
export function validatePaymentInput(
  amounts,
  paymentDate,
  amountMessage = 'Please enter a valid payment amount in at least one payment method.',
) {
  if (totalOf(amounts) <= 0) return { title: 'Warning', message: amountMessage };
  if (!paymentDate) return { title: 'Warning', message: 'Please select a payment date.' };
  return null;
}
/** Payments added from the history screen store the picked day plus the current time: YYYY-MM-DDTHH:MM:SS. */
export function paymentTimestamp(dateInput, now) {
  return dateInput ? `${dateInput}T${timeOfDay(now)}` : '';
}
export function paymentSuccessMessage(amounts) {
  let message = `Payment of ₹${formatCurrency(totalOf(amounts))} added successfully!`;
  const parts = [];
  if (amounts.cash > 0) parts.push(`Cash: ₹${formatCurrency(amounts.cash)}`);
  if (amounts.upi > 0) parts.push(`UPI: ₹${formatCurrency(amounts.upi)}`);
  if (amounts.account > 0) parts.push(`Account: ₹${formatCurrency(amounts.account)}`);
  if (parts.length > 0) message += `\nBreakdown: ${parts.join(', ')}`;
  return message;
}
export function splitPayments(payments) {
  const initial = payments.filter((p) => p.paymentType === 'initial');
  const additional = payments.filter((p) => p.paymentType !== 'initial');
  return {
    initial,
    additional,
    initialTotal: sumPaymentAmounts(initial),
    additionalTotal: sumPaymentAmounts(additional),
  };
}
/** "Additional Amount Paid" line: `₹100.00`, or `100.00 + 50.00 = ₹150.00` when there are several. '' when none. */
export function additionalPaymentsLabel(additional) {
  if (additional.length === 0) return '';
  if (additional.length === 1) return `₹${formatCurrency(additional[0].amount)}`;
  const amounts = additional.map((p) => formatCurrency(p.amount));
  return `${amounts.join(' + ')} = ₹${formatCurrency(sumPaymentAmounts(additional))}`;
}
export const paymentMethodLabel = (payment, fallback = 'N/A') =>
  payment.paymentMethod ? payment.paymentMethod.toUpperCase() : fallback;
/** Chronological order for display (stable; unparseable dates first). */
export function sortPaymentsByDate(payments) {
  return [...payments].sort((a, b) => dateMillis(a.paymentDate) - dateMillis(b.paymentDate));
}
/**
 * generatePaymentTableData(): rows of [Date, Description, Amount, Balance] for the statement's PAYMENT HISTORY table.
 * Starts at the invoice total, subtracts each payment (oldest first) and finally the returns as one row.
 *
 * PARITY NOTE: the opening "Invoice - Goods/Services" row carries TODAY's date (the web used `new Date()`), not the
 * invoice date. Kept so the printed statements look the same as the web's; pass `today` as YYYY-MM-DD.
 */
export function generatePaymentTableData(
  payments,
  grandTotal,
  totalReturns,
  today,
  billLabel = 'Invoice - Goods/Services',
) {
  const rows = [];
  let runningBalance = grandTotal;
  rows.push([formatDateIN(today), billLabel, formatCurrency(grandTotal), formatCurrency(runningBalance)]);
  for (const payment of sortPaymentsByDate(payments)) {
    runningBalance -= payment.amount;
    rows.push([
      formatDateIN(payment.paymentDate),
      `Payment - ${payment.paymentType === 'initial' ? 'Initial' : 'Additional'} (${payment.paymentMethod?.toUpperCase() || 'CASH'})`,
      `-Rs. ${formatCurrency(payment.amount)}`,
      formatCurrency(runningBalance),
    ]);
  }
  if (totalReturns > 0) {
    runningBalance -= totalReturns;
    rows.push([
      'Multiple Dates',
      'Product Returns',
      `-Rs. ${formatCurrency(totalReturns)}`,
      formatCurrency(runningBalance),
    ]);
  }
  return rows;
}
