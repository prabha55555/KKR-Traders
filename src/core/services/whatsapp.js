/**
 * WhatsApp helpers: wa.me deep links + the "invoice statement" text message (ported from pdf.js
 * PDFGenerator.shareStatementOnWhatsApp; the web source had mangled emoji, rebuilt here).
 */
import { copyText, openExternal } from '@/platform';
import { COMPANY, COUNTRY_CODE, CREDIT_LINE } from '@/core/branding';
import { db } from '@/core/db';
import { digitsOnly, formatCurrency, formatDateIN, formatInvoiceNo, toNum } from '@/core/format';
import { foldBreakdown } from '@/core/paymentMethods';
import { loadInvoiceContext } from './invoiceContext';
/**
 * Digits only; a bare 10-digit Indian number gets the 91 country code.
 * (The web app skipped the prefix when the 10 digits themselves began with "91", e.g. 9123456789 — a valid mobile
 * number — so those chats never opened. Length is the only reliable signal.)
 */
export function normalizeWhatsAppPhone(phone) {
  const clean = digitsOnly(phone);
  return clean.length === 10 ? COUNTRY_CODE + clean : clean;
}
export function whatsAppUrl(phone, text) {
  const clean = normalizeWhatsAppPhone(phone);
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${clean}${query}`;
}
/** Opens WhatsApp (chat with `phone`, or the chat picker when there is no number). */
export async function openWhatsApp(phone, text) {
  await openExternal(whatsAppUrl(phone, text));
}
const LINE = '----------------------';
const fmt = (amt) => (Math.round(amt) === amt ? String(amt) : formatCurrency(amt));
const clip = (s, n = 20) => (s.length > n ? `${s.substring(0, n)}..` : s);
/** "│ 🧻 Rolls: 12" line under a product / return that has a roll count (nothing for lines without one). */
const rollsLine = (rolls) => (toNum(rolls) > 0 ? `│ 🧻 Rolls: ${toNum(rolls)}\n` : '');
/**
 * `balanceReturns` = returns settled against the balance (they lower the due); the rest were refunded in cash / bank
 * and are only listed. Without it every return counts against the balance (callers that pass only `totalReturns`).
 */
export function buildStatementMessage(args) {
  const { invoice, returns = [], totalReturns = 0 } = args;
  const balanceReturns = args.balanceReturns ?? totalReturns;
  const refunded = Math.max(0, totalReturns - balanceReturns);
  const balanceDue = toNum(invoice.balanceDue);
  const adjustedBalanceDue = args.adjustedBalanceDue ?? balanceDue - balanceReturns;
  // carried balance + this bill's opening-balance entry; the discount gets its own line
  const previousBalance = toNum(invoice.previousBalance) + toNum(invoice.manualPreviousBalance);
  const discount = toNum(invoice.discountAmount ?? invoice.discount);
  const dateStr = formatDateIN(invoice.invoiceDate);
  let m = `*INVOICE STATEMENT*\n*${COMPANY.name}*\n\n\n`;
  m += `+${LINE}\n│ 📋 *INVOICE DETAILS*\n+${LINE}\n│ 🔢 Invoice No: ${formatInvoiceNo(invoice.invoiceNo)}\n│ 📅 Date: ${dateStr}\n+${LINE}\n\n`;
  const custName = clip(invoice.customerName || '');
  const custAddr = invoice.customerAddress ? clip(invoice.customerAddress) : 'Not specified';
  m += `+${LINE}\n│ 👤 *BILL TO*\n+${LINE}\n│ 🧑 ${custName}\n│ 📞 ${invoice.customerPhone || 'No Phone'}\n│ 📍 ${custAddr}\n+${LINE}\n\n`;
  m += `+${LINE}\n│ 📦 *PRODUCT DETAILS*\n+${LINE}\n`;
  invoice.products.forEach((p) => {
    m += `│ 🧵 ${p.description}\n${rollsLine(p.rolls)}│ ${p.qty} x Rs. ${fmt(p.rate)} = Rs. ${fmt(p.amount)}\n+${LINE}\n`;
  });
  if (totalReturns > 0) {
    m += `│ ↩️ *RETURNED ITEMS*\n+${LINE}\n`;
    returns.forEach((r) => {
      m += `│ 🧵 ${r.description}\n${rollsLine(r.rolls)}│ ${r.qty} x Rs. ${fmt(r.rate)} = -Rs. ${fmt(r.returnAmount)}`;
      if (r.reason) m += `\n│ 📝 Rsn: ${r.reason}`;
      m += `\n+${LINE}\n`;
    });
  }
  m += '\n';
  m += `+${LINE}\n│ 💰 *ACCOUNT SUMMARY*\n+${LINE}\n│ Bill Amt:   Rs. ${fmt(invoice.subtotal)}\n`;
  if (previousBalance !== 0) m += `│ Prev Bal:   Rs. ${fmt(previousBalance)}\n`;
  if (discount !== 0) m += `│ Discount:  -Rs. ${fmt(discount)}\n`;
  m += `│ Total:      Rs. ${fmt(invoice.grandTotal)}\n`;
  if (balanceReturns > 0) m += `│ Returns:   -Rs. ${fmt(balanceReturns)}\n`;
  if (refunded > 0) m += `│ Refunded:   Rs. ${fmt(refunded)}\n`;
  m += `│ Paid:       Rs. ${fmt(invoice.amountPaid)}\n`;
  const pb = foldBreakdown(invoice.paymentBreakdown);
  if (pb) {
    if (pb.cash > 0) m += `│   💵 Cash:   Rs. ${fmt(pb.cash)}\n`;
    if (pb.account > 0) {
      const acctLabel = invoice.bankAccountName ? `Acct (${invoice.bankAccountName})` : 'Acct';
      m += `│   🏦 ${acctLabel}:   Rs. ${fmt(pb.account)}\n`;
    }
  }
  m += `│ ${LINE}\n│ *DUE:       Rs. ${fmt(balanceReturns > 0 ? adjustedBalanceDue : balanceDue)}*\n+${LINE}\n`;
  m += `\n━━━━━━━━━━━━━━━━━━━━━━\n*CONTACT INFORMATION*\n🏪 *${COMPANY.name}*${COMPANY.whatsappLocation ? `\n📍 ${COMPANY.whatsappLocation}` : ''}${COMPANY.whatsappPhones ? `\n📞 ${COMPANY.whatsappPhones}` : ''}\n\n_Automated invoice statement._`;
  m += `\n\n${CREDIT_LINE}`;
  return m;
}
/** Loads the invoice's returns, builds the statement, copies it to the clipboard and opens WhatsApp. */
export async function shareStatementOnWhatsApp(invoiceNo) {
  const stored = await db.getInvoice(invoiceNo);
  if (!stored) throw new Error('Invoice not found!');
  const ctx = await loadInvoiceContext(stored);
  const message = buildStatementMessage({
    ...ctx,
    invoice: { ...ctx.invoice, bankAccountName: ctx.accountBankName },
  });
  const copied = await copyText(message);
  await openWhatsApp(stored.customerPhone, message);
  return { message, copied };
}
