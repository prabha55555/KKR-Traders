/**
 * WhatsApp helpers: wa.me deep links + the "invoice statement" text message (ported from pdf.js
 * PDFGenerator.shareStatementOnWhatsApp; the web source had mangled emoji, rebuilt here).
 */
import { copyText, openExternal } from '@/platform';
import { COMPANY, COUNTRY_CODE, CREDIT_LINE } from '@/core/branding';
import { db } from '@/core/db';
import { calculateTotalReturns } from '@/core/billing';
import { digitsOnly, formatCurrency, formatDateIN } from '@/core/format';
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
export function buildStatementMessage(args) {
  const { invoice, returns, totalReturns, adjustedBalanceDue } = args;
  const previousBalance = invoice.grandTotal - invoice.subtotal;
  const dateStr = formatDateIN(invoice.invoiceDate);
  let m = `*INVOICE STATEMENT*\n*${COMPANY.name}*\n\n\n`;
  m += `+${LINE}\n│ 📋 *INVOICE DETAILS*\n+${LINE}\n│ 🔢 No: ${invoice.invoiceNo}\n│ 📅 Date: ${dateStr}\n+${LINE}\n\n`;
  const custName = clip(invoice.customerName || '');
  const custAddr = invoice.customerAddress ? clip(invoice.customerAddress) : 'Not specified';
  m += `+${LINE}\n│ 👤 *BILL TO*\n+${LINE}\n│ 🧑 ${custName}\n│ 📞 ${invoice.customerPhone || 'No Phone'}\n│ 📍 ${custAddr}\n+${LINE}\n\n`;
  m += `+${LINE}\n│ 📦 *PRODUCT DETAILS*\n+${LINE}\n`;
  invoice.products.forEach((p) => {
    m += `│ 🧵 ${p.description}\n│ ${p.qty} x Rs. ${fmt(p.rate)} = Rs. ${fmt(p.amount)}\n+${LINE}\n`;
  });
  if (totalReturns > 0) {
    m += `│ ↩️ *RETURNED ITEMS*\n+${LINE}\n`;
    returns.forEach((r) => {
      m += `│ 🧵 ${r.description}\n│ ${r.qty} x Rs. ${fmt(r.rate)} = -Rs. ${fmt(r.returnAmount)}`;
      if (r.reason) m += `\n│ 📝 Rsn: ${r.reason}`;
      m += `\n+${LINE}\n`;
    });
  }
  m += '\n';
  m += `+${LINE}\n│ 💰 *ACCOUNT SUMMARY*\n+${LINE}\n│ Bill Amt:   Rs. ${fmt(invoice.subtotal)}\n`;
  if (previousBalance > 0) m += `│ Prev Bal:   Rs. ${fmt(previousBalance)}\n`;
  m += `│ Total:      Rs. ${fmt(invoice.grandTotal)}\n`;
  if (totalReturns > 0) m += `│ Returns:   -Rs. ${fmt(totalReturns)}\n`;
  m += `│ Paid:       Rs. ${fmt(invoice.amountPaid)}\n`;
  const pb = invoice.paymentBreakdown;
  if (pb) {
    if (pb.cash > 0) m += `│   💵 Cash:   Rs. ${fmt(pb.cash)}\n`;
    if (pb.upi > 0) m += `│   📱 UPI:    Rs. ${fmt(pb.upi)}\n`;
    if (pb.account > 0) {
      const acctLabel = invoice.bankAccountName ? `Acct (${invoice.bankAccountName})` : 'Acct';
      m += `│   🏦 ${acctLabel}:   Rs. ${fmt(pb.account)}\n`;
    }
  }
  m += `│ ${LINE}\n│ *DUE:       Rs. ${fmt(totalReturns > 0 ? adjustedBalanceDue : invoice.balanceDue)}*\n+${LINE}\n`;
  m += `\n━━━━━━━━━━━━━━━━━━━━━━\n*CONTACT INFORMATION*\n🏪 *${COMPANY.name}*${COMPANY.whatsappLocation ? `\n📍 ${COMPANY.whatsappLocation}` : ''}${COMPANY.whatsappPhones ? `\n📞 ${COMPANY.whatsappPhones}` : ''}\n\n_Automated invoice statement._`;
  m += `\n\n${CREDIT_LINE}`;
  return m;
}
/** Loads the invoice's returns, builds the statement, copies it to the clipboard and opens WhatsApp. */
export async function shareStatementOnWhatsApp(invoiceNo) {
  const invoice = await db.getInvoice(invoiceNo);
  if (!invoice) throw new Error('Invoice not found!');
  const [totalReturns, returns, rawPayments, bankAccounts] = await Promise.all([
    calculateTotalReturns(invoiceNo),
    db.getReturnsByInvoice(invoiceNo),
    db.getPaymentsByInvoice(invoiceNo).catch(() => []),
    db.getAllBankAccounts().catch(() => []),
  ]);
  const bankMap = new Map((bankAccounts || []).map((b) => [b.id, b]));
  const defaultBank = bankAccounts?.[0];

  let pb = invoice.paymentBreakdown ? { ...invoice.paymentBreakdown } : null;
  let totalPaid = invoice.amountPaid || 0;

  if (rawPayments.length > 0) {
    let cash = 0,
      upi = 0,
      account = 0;
    rawPayments.forEach((p) => {
      const m = (p.paymentMethod || 'cash').toLowerCase();
      if (m === 'cash') cash += p.amount || 0;
      else if (m === 'upi') upi += p.amount || 0;
      else if (m === 'account') account += p.amount || 0;
    });
    pb = { cash, upi, account };
    totalPaid = cash + upi + account;
  }

  let bankAccountName = '';
  const bankForInvoice = invoice.bankAccountId ? bankMap.get(invoice.bankAccountId) : null;
  if (bankForInvoice) {
    bankAccountName = bankForInvoice.accountName;
  } else {
    const accPayment = rawPayments.find((p) => (p.paymentMethod || '').toLowerCase() === 'account');
    if (accPayment && accPayment.bankAccountId && bankMap.get(accPayment.bankAccountId)) {
      bankAccountName = bankMap.get(accPayment.bankAccountId).accountName;
    } else if (defaultBank && (pb?.account > 0 || invoice.paymentMethod === 'account')) {
      bankAccountName = defaultBank.accountName;
    }
  }

  const resolvedInvoice = {
    ...invoice,
    paymentBreakdown: pb,
    amountPaid: totalPaid,
    balanceDue: invoice.grandTotal - totalPaid,
    bankAccountName,
  };

  const message = buildStatementMessage({
    invoice: resolvedInvoice,
    returns,
    totalReturns,
    adjustedBalanceDue: resolvedInvoice.balanceDue - totalReturns,
  });
  const copied = await copyText(message);
  await openWhatsApp(invoice.customerPhone, message);
  return { message, copied };
}
