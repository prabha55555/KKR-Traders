/**
 * Purchase statements: the supplier's combined statement (screen summary, PDFs, WhatsApp text) and the per-bill
 * statement (purchase-history.js searchSupplierInvoices, displaySupplierStatementResults, generateCombinedStatement(Easy),
 * shareCombinedStatementViaWhatsApp, generateStatement, generatePDFStatement).
 *
 * PARITY NOTE: the live web statement hard-coded "no purchase returns" (`totalReturns = 0`, a leftover comment says
 * purchase returns did not exist yet) although this page adds / undoes them, so its balance disagreed with the bill card.
 * The returns collection is used here, like the earlier (shadowed) copies of those functions did.
 */
import { copyText, openExternal } from '@/platform';
import { db } from '@/core/db';
import { PURCHASE_LEDGER, groupParties, partySummary, returnsTotalsByInvoice } from '@/core/ledger';
import { getLogoSrc } from '@/core/services/invoiceShare';
import { printStatementHtml, shareStatementPdf } from '../lib/documentOutput';
import { indexByInvoiceNo } from '../lib/lookups';
import { buildCombinedStatement, findStatementParties, partyChoice } from '../lib/statement';
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
import { userError } from '../lib/types';
import { PURCHASE_LABELS, toHistoryPurchase } from './purchaseModel';
import { PURCHASE_BILL_NOT_FOUND, statementPayments } from './purchasePayments';
// ------------------------------------------------------------------ combined (all bills of a supplier)
/**
 * The statement of ONE supplier (a ledger party: phone first, then name — see lib/statement findStatementParties):
 * the typed phone / exact name / part of a name, or `partyKey` once the user picked one. Returns null when nothing
 * matches, `{ choices }` when several suppliers match, else the statement (newest bill first) whose totals and
 * outstanding balance come from the supplier's ledger. Payments are loaded too because the detailed PDF prints them.
 */
export async function loadSupplierStatement(query, partyKey) {
  const [bills, returns, payments] = await Promise.all([
    db.getAllPurchaseBills(),
    db.getAllPurchaseReturns(),
    db.getAllPurchasePayments(),
  ]);
  const parties = partyKey
    ? groupParties(PURCHASE_LEDGER, bills).filter((p) => p.key === partyKey)
    : findStatementParties(PURCHASE_LEDGER, bills, query);
  if (parties.length === 0) return null;
  if (parties.length > 1) return { choices: parties.map(partyChoice) };
  const [party] = parties;
  const returnsByInvoice = indexByInvoiceNo(returns);
  const paymentsByInvoice = indexByInvoiceNo(payments);
  const views = party.bills.map((bill) => {
    const view = toHistoryPurchase(
      bill,
      paymentsByInvoice.get(bill.invoiceNo) ?? [],
      returnsByInvoice.get(bill.invoiceNo) ?? [],
      false,
    );
    return { ...view, payments: statementPayments(bill, view.payments) };
  });
  const summary = partySummary(PURCHASE_LEDGER, party.bills, {
    returnsByInvoice: returnsTotalsByInvoice(returns),
  });
  return { ...buildCombinedStatement(party.name, views, summary), partyKey: party.key };
}
/** The PDF: shared as a file where the device can, otherwise the system print dialog (web: a print window). */
async function exportHtml(html, fileName, dialogTitle) {
  if ((await shareStatementPdf(html, fileName, dialogTitle)) === 'shared') return 'shared';
  await printStatementHtml(html);
  return 'printed';
}
/** generateCombinedPDFStatement(): every bill with its returns and payment history. */
export async function exportCombinedSupplierStatement(statement, now = new Date()) {
  const html = buildCombinedStatementHtml({
    statement,
    labels: PURCHASE_LABELS,
    logoSrc: await getLogoSrc(),
    now,
  });
  return exportHtml(html, combinedStatementFileName(statement.partyName, now), 'Combined statement');
}
/** generateCombinedPDFStatementEasy(): one line per bill + totals. */
export async function exportEasySupplierStatement(statement, now = new Date()) {
  const html = buildEasyStatementHtml({
    partyName: statement.partyName,
    invoices: statement.invoices,
    opening: statement.totals.opening,
    outstanding: statement.totals.outstanding,
    labels: PURCHASE_LABELS,
    logoSrc: await getLogoSrc(),
    now,
  });
  if (!html) throw userError('No invoices found for this supplier.');
  return exportHtml(html, easyStatementFileName(statement.partyName, now), 'Combined statement');
}
/**
 * shareCombinedStatementViaWhatsApp(): copies the text to the clipboard (always, as the web did) and opens
 * wa.me/<phone> with it. Throws a user-facing error for a missing / malformed phone number.
 */
export async function shareSupplierStatementOnWhatsApp(statement) {
  const message = buildCombinedStatementMessage(statement, PURCHASE_LABELS);
  const phone = checkWhatsAppPhone(statement.partyPhone, PURCHASE_LABELS.party);
  if (!phone.ok) throw userError(phone.message);
  const copied = await copyText(message);
  await openExternal(combinedStatementWhatsAppUrl(phone.phone, message));
  return { copied };
}
// ------------------------------------------------------------------ one bill
/** generatePDFStatement() inputs: the bill, its payments (plus the synthetic initial one) and its returns. */
async function buildBillStatement(invoiceNo, now) {
  const bill = await db.getPurchaseBill(invoiceNo);
  if (!bill) throw userError(PURCHASE_BILL_NOT_FOUND);
  const [documents, returns] = await Promise.all([
    db.getPurchasePaymentsByInvoice(invoiceNo),
    db.getPurchaseReturnsByInvoice(invoiceNo),
  ]);
  const view = toHistoryPurchase(bill, documents, returns, false);
  const html = buildInvoiceStatementHtml({
    invoice: view,
    payments: statementPayments(bill, view.payments),
    returns: view.returns,
    totalReturns: view.totalReturns,
    balanceReturns: view.balanceReturns,
    adjustedBalanceDue: view.adjustedBalanceDue,
    labels: PURCHASE_LABELS,
    logoSrc: await getLogoSrc(),
    now,
  });
  const shownNo = PURCHASE_LABELS.formatInvoiceNo?.(bill.invoiceNo) ?? bill.invoiceNo;
  return { html, shownNo, fileName: invoiceStatementFileName(shownNo, bill.supplierName, now) };
}
/** generateStatement(): "Download Statement" -> the system print / Save-as-PDF dialog. */
export async function downloadPurchaseStatement(invoiceNo, now = new Date()) {
  const { html } = await buildBillStatement(invoiceNo, now);
  await printStatementHtml(html);
}
/**
 * shareInvoiceViaWhatsApp(): "Share Statement" -> the PDF through the share sheet. 'fallback' = this device cannot
 * share files, so the print dialog was opened instead (the web only ever downloaded the file).
 */
export async function sharePurchaseStatement(invoiceNo, now = new Date()) {
  const { html, fileName, shownNo } = await buildBillStatement(invoiceNo, now);
  if ((await shareStatementPdf(html, fileName, `Statement for Invoice No ${shownNo}`)) === 'shared')
    return 'shared';
  await printStatementHtml(html);
  return 'fallback';
}
