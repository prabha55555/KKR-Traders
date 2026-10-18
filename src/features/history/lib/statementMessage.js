/** WhatsApp text of the combined statement (shareCombinedStatementViaWhatsApp) and the phone check its sender uses. */
import { COUNTRY_CODE, CREDIT_LINE } from '@/core/branding';
import { getBusiness, printName, sharePhonesOf } from '@/core/business';
import { digitsOnly, formatCurrency, formatDateIN, toNum } from '@/core/format';
import { foldBreakdown } from '@/core/paymentMethods';
import { balanceReturnsOf, invoiceDue, refundedReturnsOf } from './statement';
import { displayInvoiceNo } from './types';
const HEAVY = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const LIGHT = '────────────────────────────────';
const DOTTED = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';
const rs = (amount) => `₹${formatCurrency(amount)}`;
function invoiceBlock(invoice, isLast, labels) {
  const lines = [
    `*INVOICE NO ${displayInvoiceNo(labels, invoice.invoiceNo)}* ${isLast ? '' : DOTTED}`.trimEnd(),
    `📅 Date: ${formatDateIN(invoice.invoiceDate)}`,
    '',
    '💰 *BILL SUMMARY:*',
    `   Current Bill: ${rs(invoice.subtotal)}`,
  ];
  if (toNum(invoice.previousBalance) !== 0) lines.push(`   Previous Balance: ${rs(invoice.previousBalance)}`);
  if (invoice.discountAmount) lines.push(`   Discount Amount: -${rs(invoice.discountAmount)}`);
  lines.push(`   Total Amount: ${rs(invoice.grandTotal)}`, `   Amount Paid: ${rs(invoice.amountPaid)}`);
  const pb = foldBreakdown(invoice.paymentBreakdown);
  if (pb) {
    const parts = [];
    if (pb.cash > 0) parts.push(`💵 Cash: ${rs(pb.cash)}`);
    if (pb.account > 0) {
      const accLabel = invoice.bankAccountName
        ? `🏦 Account (${invoice.bankAccountName}): ${rs(pb.account)}`
        : `🏦 Account: ${rs(pb.account)}`;
      parts.push(accLabel);
    }
    if (parts.length > 0) lines.push(`💳 ${parts.join(' | ')}`);
  }
  const adjusted = balanceReturnsOf(invoice);
  const refunded = refundedReturnsOf(invoice);
  if (adjusted > 0) lines.push(`   Returns: -${rs(adjusted)}`);
  if (refunded > 0) lines.push(`   Returns (refunded): ${rs(refunded)}`);
  lines.push('');
  if (invoice.products.length > 0) {
    lines.push('📦 *PRODUCTS:*');
    invoice.products.forEach((p, i) => {
      lines.push(
        `   ${i + 1}. ${p.description}`,
        `      Qty: ${p.qty} × Rate: ${rs(p.rate)} = ${rs(p.amount)}`,
      );
    });
  }
  if (invoice.returns.length > 0) {
    lines.push('🔄 *RETURNS:*');
    invoice.returns.forEach((r, i) => {
      lines.push(
        `   ${i + 1}. ${r.description}`,
        `      Qty: ${r.qty} × Rate: ${rs(r.rate)} = -${rs(r.returnAmount)}`,
      );
      if (r.reason) lines.push(`      Reason: ${r.reason}`);
    });
  }
  if (invoice.products.length > 0 || invoice.returns.length > 0) lines.push('');
  lines.push(
    adjusted > 0
      ? `✅ *ADJUSTED BALANCE DUE: ${rs(invoiceDue(invoice))}*`
      : `✅ *BALANCE DUE: ${rs(invoiceDue(invoice))}*`,
  );
  return lines.join('\n');
}
/**
 * The statement text as the web composed it (sections, order), minus the empty filler lines. The outstanding balance
 * is the party's ledger balance (buildCombinedStatement totals.outstanding).
 */
export function buildCombinedStatementMessage(statement, labels) {
  const { invoices, totals } = statement;
  const party = labels.party;
  const hasReturns = totals.totalReturns > 0;
  const lines = [
    `*${printName()} - ACCOUNT STATEMENT*`,
    '',
    HEAVY,
    '',
    `*${party.toUpperCase()} DETAILS*`,
    LIGHT,
    `👤 ${party}: ${statement.partyName}`,
    `📍 Address: ${statement.partyAddress || 'Not specified'}`,
    `📊 Total Invoices: ${totals.totalInvoices}`,
    '',
    HEAVY,
    '',
    invoices.map((invoice, i) => invoiceBlock(invoice, i === invoices.length - 1, labels)).join('\n\n'),
    '',
    HEAVY,
    '',
    '*OVERALL ACCOUNT SUMMARY*',
    LIGHT,
    `📊 Total Invoices: ${totals.totalInvoices}`,
    ...(totals.opening ? [`📒 Opening Balance: ${rs(totals.opening)}`] : []),
    `💰 Total Bill Amount: ${rs(totals.totalBilled)}`,
    `💳 Total Amount Paid: ${rs(totals.totalPaid)}`,
  ];
  if (totals.totalCash > 0) lines.push(`   💵 Cash: ${rs(totals.totalCash)}`);
  if (totals.totalAccount > 0) lines.push(`   🏦 Account: ${rs(totals.totalAccount)}`);
  if (totals.balanceReturns > 0) lines.push(`🔄 Total Returns: -${rs(totals.balanceReturns)}`);
  if (totals.refundedReturns > 0) lines.push(`🔄 Returns (refunded): ${rs(totals.refundedReturns)}`);
  lines.push(
    '',
    totals.balanceReturns > 0
      ? `✅ *ADJUSTED OUTSTANDING BALANCE: ${rs(totals.outstanding)}*`
      : `✅ *OUTSTANDING BALANCE: ${rs(totals.outstanding)}*`,
    '',
  );
  if (hasReturns)
    lines.push('*RETURN SUMMARY*', LIGHT, `📦 Total Return Amount: ${rs(totals.totalReturns)}`, '');
  lines.push(
    '*INVOICE NOS*',
    LIGHT,
    ...invoices.map(
      (i) =>
        `• ${displayInvoiceNo(labels, i.invoiceNo)} - ${formatDateIN(i.invoiceDate)} - Due: ${rs(invoiceDue(i))}`,
    ),
    '',
    HEAVY,
    '',
    '*CONTACT INFORMATION*',
    LIGHT,
    `🏢 *${printName()}*`,
    ...(getBusiness().shareLocation ? [`📍 ${getBusiness().shareLocation}`] : []),
    ...(sharePhonesOf() ? [`📞 *Phone: ${sharePhonesOf()}*`] : []),
    '',
    '_This is an automated statement. Please contact us for any queries._',
  );
  return lines.join('\n');
}
/**
 * invoice-history.js openWhatsApp(): digits only, a number that does not already start with the country code gets it
 * (leading zeros dropped), and the result must be 12 digits.
 *
 * Deviation: a 10-digit mobile number that merely STARTS with "91" (e.g. 9123456789) is a local number, not one with
 * the country code — the web rejected it as "invalid"; here it gets the code like every other 10-digit number.
 */
export function checkWhatsAppPhone(phoneNumber, party = 'Customer') {
  const FULL_LENGTH = COUNTRY_CODE.length + 10;
  const hasCountryCode = (s) => s.startsWith(COUNTRY_CODE) && s.length === FULL_LENGTH;
  let clean = digitsOnly(phoneNumber);
  if (clean && !hasCountryCode(clean)) {
    clean = clean.replace(/^0+/, '');
    if (!hasCountryCode(clean)) clean = COUNTRY_CODE + clean;
  }
  if (!clean)
    return {
      ok: false,
      message: `${party} phone number not found. Please check ${party.toLowerCase()} details.`,
    };
  if (clean.length !== FULL_LENGTH) {
    return {
      ok: false,
      message: `Invalid phone number format. Please ensure it's a 10-digit Indian number. Current: ${clean}`,
    };
  }
  return { ok: true, phone: clean };
}
/** wa.me link; the developer credit is appended to the link text only (the clipboard copy stays without it). */
export function combinedStatementWhatsAppUrl(phone, message) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(`${message}\n\n${CREDIT_LINE}`)}`;
}
