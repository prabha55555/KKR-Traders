/**
 * Print / share for sales invoices (the original used window.print + a wa.me link).
 *  - printInvoice():     browser print dialog (also "Save as PDF") — ORIGINAL page + slip image (if present)
 *  - shareInvoicePdf():  print dialog / share sheet, then opens customer's WhatsApp — ORIGINAL page + slip image (if present)
 */
import logoUrl from '@/assets/brand/logo.png';
import { calculateTotalReturns } from '@/core/billing';
import { db } from '@/core/db';
import { printHtml, sharePdfHtml } from '@/platform';
import { buildInvoiceHtml } from './invoiceHtml';
import { normalizeWhatsAppPhone, openWhatsApp } from './whatsapp';

let logoPromise = null;

/** Company logo as a data URI so it is embedded in printed documents (works offline and inside the print iframe). */
export function getLogoSrc() {
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const blob = await (await fetch(logoUrl)).blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.warn('Could not load logo for invoice', error);
        return '';
      }
    })();
  }
  return logoPromise;
}

async function buildContext(invoice) {
  const invoiceNo = invoice.invoiceNo;
  const [totalReturns, returns, rawPayments, bankAccounts] = await Promise.all([
    calculateTotalReturns(invoiceNo),
    db.getReturnsByInvoice(invoiceNo),
    db.getPaymentsByInvoice(invoiceNo).catch(() => []),
    db.getAllBankAccounts().catch(() => []),
  ]);

  const bankMap = new Map((bankAccounts || []).map((b) => [b.id, b]));
  const defaultBank = bankAccounts?.[0];

  const payments = (rawPayments || []).map((p) => {
    const rawMethod = (p.paymentMethod || 'cash').toLowerCase();
    const bank = p.bankAccountId
      ? bankMap.get(p.bankAccountId)
      : rawMethod === 'account'
        ? defaultBank
        : null;
    const bankAccountName = bank
      ? `${bank.accountName}${bank.bankName ? ` (${bank.bankName})` : ''}`
      : bank?.accountName || '';
    return {
      ...p,
      bankAccountName,
    };
  });

  let pb = invoice.paymentBreakdown ? { ...invoice.paymentBreakdown } : null;
  let totalPaid = invoice.amountPaid || 0;

  if (payments.length > 0) {
    let cash = 0;
    let upi = 0;
    let account = 0;
    payments.forEach((p) => {
      const m = (p.paymentMethod || 'cash').toLowerCase();
      if (m === 'cash') cash += p.amount || 0;
      else if (m === 'upi') upi += p.amount || 0;
      else if (m === 'account') account += p.amount || 0;
    });
    pb = { cash, upi, account };
    totalPaid = cash + upi + account;
  }

  let accountBankName = '';
  const bankForInvoice = invoice.bankAccountId ? bankMap.get(invoice.bankAccountId) : null;
  if (bankForInvoice) {
    accountBankName = bankForInvoice.accountName;
  } else {
    const accPayment = payments.find((p) => (p.paymentMethod || '').toLowerCase() === 'account');
    if (accPayment && accPayment.bankAccountId && bankMap.get(accPayment.bankAccountId)) {
      accountBankName = bankMap.get(accPayment.bankAccountId).accountName;
    } else if (defaultBank && (pb?.account > 0 || invoice.paymentMethod === 'account')) {
      accountBankName = defaultBank.accountName;
    }
  }

  const resolvedInvoice = {
    ...invoice,
    paymentBreakdown: pb,
    amountPaid: totalPaid,
    balanceDue: invoice.grandTotal - totalPaid,
  };

  return {
    invoice: resolvedInvoice,
    totalReturns,
    adjustedBalanceDue: resolvedInvoice.balanceDue - totalReturns,
    returns,
    payments,
    accountBankName,
    logoSrc: await getLogoSrc(),
  };
}

/** Opens the print dialog for the invoice (ORIGINAL page + attached slip image if present). */
export async function printInvoice(invoice) {
  const html = buildInvoiceHtml(await buildContext(invoice));
  await printHtml(html);
}

/**
 * "Share BILL": builds the invoice PDF (ORIGINAL page + attached slip image if present) and opens the device's share sheet with it ('shared'). Where the browser cannot
 * share files: print dialog (save as PDF) and the customer's WhatsApp chat to attach it ('fallback').
 */
export async function shareInvoicePdf(invoice) {
  const html = buildInvoiceHtml(await buildContext(invoice));
  if ((await sharePdfHtml(html, `SS ${invoice.invoiceNo}.pdf`, `SS ${invoice.invoiceNo}`)) === 'shared')
    return 'shared';
  await printHtml(html);
  if (normalizeWhatsAppPhone(invoice.customerPhone)) await openWhatsApp(invoice.customerPhone);
  return 'fallback';
}
