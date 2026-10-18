/**
 * Sales statements: the customer's combined statement (screen summary, PDFs, WhatsApp text) and the per-invoice
 * statement (invoice-history.js searchCustomerInvoices, generateCombinedStatement(Easy), shareCombinedStatementViaWhatsApp,
 * generateStatement, generatePDFStatement).
 */
import { copyText, openExternal } from '@/platform';
import { calculateTotalReturns } from '@/core/billing';
import { db } from '@/core/db';
import { getLogoSrc } from '@/core/services/invoiceShare';
import { printStatementHtml, shareStatementPdf } from '../lib/documentOutput';
import { indexByInvoiceNo } from '../lib/lookups';
import { buildCombinedStatement, matchPartyInvoices } from '../lib/statement';
import {
  buildCombinedStatementHtml,
  buildEasyStatementHtml,
  buildInvoiceStatementHtml,
  combinedStatementFileName,
  easyStatementFileName,
  invoiceStatementFileName,
} from '../lib/statementHtml';
import {
  buildCombinedStatementMessage,
  checkWhatsAppPhone,
  combinedStatementWhatsAppUrl,
} from '../lib/statementMessage';
import { SALES_LABELS, userError } from '../lib/types';
import { toHistoryInvoice } from './salesModel';
// ------------------------------------------------------------------ combined (all invoices of a customer)
/**
 * Customers whose name CONTAINS the typed text (case-insensitive) are combined into one statement, newest invoice
 * first. Returns null when nothing matches. Payments are loaded too because the detailed PDF prints them.
 */
export async function loadCustomerStatement(customerName) {
  const [invoices, returns, payments] = await Promise.all([
    db.getAllInvoices(),
    db.getAllReturns(),
    db.getAllPayments(),
  ]);
  const returnsByInvoice = indexByInvoiceNo(returns);
  const paymentsByInvoice = indexByInvoiceNo(payments);
  const matched = matchPartyInvoices(
    invoices.map((i) => ({ partyName: i.customerName, invoice: i })),
    customerName,
  ).map(({ invoice }) =>
    toHistoryInvoice(
      invoice,
      paymentsByInvoice.get(invoice.invoiceNo) ?? [],
      returnsByInvoice.get(invoice.invoiceNo) ?? [],
      false,
    ),
  );
  return buildCombinedStatement(customerName, matched);
}
/**
 * The statement PDF: shared as a file where the device can ("Save to Files", WhatsApp, Drive…), otherwise the
 * system print dialog (web: a print window), whose "Save as PDF" gives the same file.
 */
async function exportHtml(html, fileName, dialogTitle) {
  if ((await shareStatementPdf(html, fileName, dialogTitle)) === 'shared') return 'shared';
  await printStatementHtml(html);
  return 'printed';
}
/** generateCombinedPDFStatement(): every invoice with its returns and payment history. */
export async function exportCombinedStatement(statement, now = new Date()) {
  const html = buildCombinedStatementHtml({
    statement,
    labels: SALES_LABELS,
    logoSrc: await getLogoSrc(),
    now,
  });
  return exportHtml(html, combinedStatementFileName(statement.partyName, now), 'Combined statement');
}
/** generateCombinedPDFStatementEasy(): one line per invoice + totals. */
export async function exportEasyStatement(statement, now = new Date()) {
  const html = buildEasyStatementHtml({
    partyName: statement.partyName,
    invoices: statement.invoices,
    labels: SALES_LABELS,
    logoSrc: await getLogoSrc(),
    now,
  });
  if (!html) throw userError('No invoices found for this customer.');
  return exportHtml(html, easyStatementFileName(statement.partyName, now), 'Combined statement');
}
/**
 * shareCombinedStatementViaWhatsApp(): copies the text to the clipboard (always, as the web did) and opens
 * wa.me/<phone> with it. Throws a user-facing error for a missing / malformed phone number.
 */
export async function shareCombinedStatementOnWhatsApp(statement) {
  const message = buildCombinedStatementMessage(statement, SALES_LABELS);
  const phone = checkWhatsAppPhone(statement.partyPhone, SALES_LABELS.party);
  if (!phone.ok) throw userError(phone.message);
  const copied = await copyText(message);
  await openExternal(combinedStatementWhatsAppUrl(phone.phone, message));
  return { copied };
}
// ------------------------------------------------------------------ one invoice
/** generatePDFStatement() inputs: the invoice, its payments and (only when there are returns) its returns. */
async function buildInvoiceStatement(invoiceNo, now) {
  const invoice = await db.getInvoice(invoiceNo);
  if (!invoice) throw userError('Invoice not found!');
  const payments = await db.getPaymentsByInvoice(invoiceNo);
  const totalReturns = await calculateTotalReturns(invoiceNo);
  const returns = totalReturns > 0 ? await db.getReturnsByInvoice(invoiceNo) : [];
  const view = toHistoryInvoice(invoice, payments, returns, false);
  const html = buildInvoiceStatementHtml({
    invoice: view,
    payments: view.payments,
    returns: view.returns,
    totalReturns,
    adjustedBalanceDue: invoice.balanceDue - totalReturns,
    labels: SALES_LABELS,
    logoSrc: await getLogoSrc(),
    now,
  });
  return { html, fileName: invoiceStatementFileName(invoice.invoiceNo, invoice.customerName, now) };
}
/** generateStatement(): "Download Statement" -> the system print / Save-as-PDF dialog. */
export async function downloadInvoiceStatement(invoiceNo, now = new Date()) {
  const { html } = await buildInvoiceStatement(invoiceNo, now);
  await printStatementHtml(html);
}
/**
 * shareInvoiceViaWhatsApp(): "Share Statement" -> the PDF through the share sheet. 'fallback' = this device cannot
 * share files, so the print dialog was opened instead (the web fell back to a download).
 */
export async function shareInvoiceStatement(invoiceNo, now = new Date()) {
  const { html, fileName } = await buildInvoiceStatement(invoiceNo, now);
  if ((await shareStatementPdf(html, fileName, `Statement for Invoice #${invoiceNo}`)) === 'shared')
    return 'shared';
  await printStatementHtml(html);
  return 'fallback';
}
