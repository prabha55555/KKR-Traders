/**
 * Printable account statements (replace the web app's jsPDF + autoTable output). Pure HTML builders — rendered to a
 * PDF by expo-print in `documentOutput.ts`. Sections, columns and totals follow generatePDFStatement,
 * generateCombinedPDFStatement and generateCombinedPDFStatementEasy.
 */
import { VENDOR } from '@/core/branding';
import { getBusiness, monogramOf, printName, sharePhonesOf } from '@/core/business';
import { formatCurrency, formatDateIN, toISODate, toNum } from '@/core/format';
import { formatDateTimeIN } from './dates';
import { generatePaymentTableData } from './payments';
import { balanceReturnsOf, buildEasyStatement, invoiceDue, refundedReturnsOf } from './statement';
import { displayInvoiceNo } from './types';
export const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const NOT_SPECIFIED = 'Not specified';
const CSS = `
  @page { margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #000; margin: 0; font-size: 11px; line-height: 1.35; }
  .watermark-text { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 90px; font-weight: 900; color: rgba(0, 0, 0, 0.05); z-index: 0; white-space: nowrap; user-select: none; text-align: center; }
  .doc { position: relative; z-index: 1; }
  .header-container { display: flex; position: relative; margin-bottom: 24px; min-height: 70px; }
  .header-left { flex: 1; text-align: left; z-index: 10; padding-right: 10px; }
  .header-center { width: 150px; text-align: center; z-index: 10; margin: 0 10px; }
  .header-center img { width: 100%; height: 110px; object-fit: contain; }
  .header-right { flex: 1; text-align: right; z-index: 10; padding-left: 10px; }
  .header-right .section { margin-top: 0; margin-bottom: 4px; font-size: 11px; font-weight: bold; }
  .header-right .info { font-size: 9px; color: #444; line-height: 1.4; margin: 0; }
  .company { font-size: 16px; font-weight: bold; margin: 0 0 4px 0; color: #000; }
  .company-sub { font-size: 10px; color: #444; line-height: 1.4; }
  .title { font-size: 14px; font-weight: bold; text-align: center; margin: 20px auto 14px; padding-bottom: 3px; width: 270px; }
  .title.green { border-bottom: 1.5px solid #006400; }
  .title.black { border-bottom: 1.5px solid #000; }
  .section { font-size: 11px; font-weight: bold; margin: 14px 0 6px; }
  .section.underlined { display: inline-block; border-bottom: 1px solid #646464; padding-bottom: 3px; margin-bottom: 10px; }
  .info { font-size: 9px; color: #646464; margin: 2px 0; }
  .info.easy { font-size: 10px; margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 0.6px solid #c8c8c8; padding: 4px 5px; font-size: 9px; }
  th { background: #f0f0f0; font-weight: bold; }
  .l { text-align: left; } .c { text-align: center; } .r { text-align: right; }
  table.small td { font-size: 8px; }
  table.plain th, table.plain td { border: none; font-size: 10px; padding: 6px 4px; }
  table.plain th { background: #fff; border-bottom: 1px solid #000; }
  table.plain td { border-bottom: 0.4px solid #dcdcdc; color: #1e1e1e; }
  .summary { text-align: right; font-size: 9px; margin: 8px 0 14px; }
  .summary div { margin: 2px 0; }
  .bold { font-weight: bold; }
  .red { color: #dc3545; }
  .invoice-block { margin-bottom: 14px; }
  .separator { border-top: 0.6px solid #dcdcdc; margin: 14px 0 12px; }
  .totals { width: 260px; margin: 14px 0 0 auto; font-size: 11px; }
  .totals .row { display: flex; justify-content: space-between; margin: 3px 0; }
  .totals .final { border-top: 1.2px solid #000; padding-top: 6px; margin-top: 8px; font-weight: bold; font-size: 12px; }
  .footer { text-align: center; font-size: 8px; color: #646464; margin-top: 36px; }
  .footer div { margin: 2px 0; }
`;
function wrap(title, watermarkText, logoSrc, partyInfoHtml, body) {
  // the business on the statement (Settings page)
  const biz = getBusiness();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${CSS}</style>
</head>
<body>
  ${watermarkText ? `<div class="watermark-text">${esc(watermarkText)}</div>` : ''}
  <div class="doc">
    <div class="header-container">
      <div class="header-left">
        <div class="company">${esc(printName(biz))}</div>
        ${biz.tagline ? `<div class="company-sub">${esc(biz.tagline)}</div>` : ''}
        ${biz.address ? `<div class="company-sub">${esc(biz.address)}</div>` : ''}
        ${biz.phones ? `<div class="company-sub">Cell: ${esc(biz.phones)}</div>` : ''}
        ${biz.gstin ? `<div class="company-sub">GSTIN: ${esc(biz.gstin)}</div>` : ''}
      </div>
      ${logoSrc ? `<div class="header-center"><img src="${logoSrc}" alt="${esc(biz.name)}" /></div>` : ''}
      <div class="header-right">
        ${partyInfoHtml || ''}
      </div>
    </div>
    ${body}
  </div>
</body>
</html>`;
}
/** Cells are HTML (callers escape user text with `esc`). */
function table(headers, rows, cls = '') {
  const head = headers.map(([label, align]) => `<th class="${align}">${esc(label)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell, i) => `<td class="${headers[i][1]}">${cell}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="${cls}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
const productsTable = (invoice) =>
  table(
    [
      ['S.No.', 'c'],
      ['Description', 'l'],
      ['Qty', 'c'],
      ['Rate', 'r'],
      ['Amount', 'r'],
    ],
    invoice.products.map((p, i) => [
      String(i + 1),
      esc(p.description),
      esc(p.qty),
      formatCurrency(p.rate),
      formatCurrency(p.amount),
    ]),
  );
const returnsTable = (returns) =>
  table(
    [
      ['Date', 'c'],
      ['Product', 'l'],
      ['Qty', 'c'],
      ['Rate', 'r'],
      ['Amount', 'r'],
    ],
    returns.map((r) => [
      formatDateIN(r.returnDate),
      esc(r.description),
      esc(r.qty),
      formatCurrency(r.rate),
      formatCurrency(r.returnAmount),
    ]),
    'small',
  );
const paymentsTable = (payments, grandTotal, balanceReturns, refundedReturns, today, labels) =>
  table(
    [
      ['Date', 'c'],
      ['Description', 'l'],
      ['Amount', 'r'],
      ['Balance', 'r'],
    ],
    generatePaymentTableData(
      payments,
      grandTotal,
      balanceReturns,
      today,
      labels.statementBillLabel,
      refundedReturns,
    ).map((row) => row.map(esc)),
  );
function footer(now, includeCredit) {
  return `<div class="footer">
      <div>This is a computer-generated statement. No signature is required.</div>
      ${sharePhonesOf() ? `<div>For any queries, please contact: ${esc(sharePhonesOf())}</div>` : ''}
      <div>Generated on: ${esc(formatDateTimeIN(now))}</div>
      ${includeCredit ? `<div style="margin-top: 10px; font-size: 13px; color: #1b2030; font-weight: bold;">Software created by ${esc(VENDOR.creditName)} <span style="color: #666; font-weight: normal; margin: 0 5px;">|</span> For custom billing solutions, contact: ${esc(VENDOR.phone)}</div>` : ''}
    </div>`;
}
const rs = (amount) => `Rs. ${formatCurrency(amount)}`;
/** "SS Statement <party>" / "SS STATEMENT" — the business's initials (Settings page). */
const statementTitle = (party) => `${monogramOf() || 'Account'} Statement ${party ?? ''}`.trim();
const statementWatermark = () => `${monogramOf() ? `${monogramOf()} ` : ''}STATEMENT`;
const todayOf = (now) => toISODate(now);
/**
 * generatePDFStatement(): "ACCOUNT STATEMENT" for one invoice. `totalReturns` = all returns of the bill;
 * `balanceReturns` = those settled against its balance (default: the invoice view's figure); the rest were refunded
 * and are listed without lowering the balance. `adjustedBalanceDue` = balanceDue − balanceReturns.
 */
export function buildInvoiceStatementHtml(input) {
  const { invoice, payments, returns, totalReturns, adjustedBalanceDue, labels, logoSrc, now } = input;
  const balanceReturns = toNum(input.balanceReturns ?? invoice.balanceReturns ?? totalReturns);
  const refundedReturns = Math.max(0, toNum(totalReturns) - balanceReturns);
  const party = labels.party;
  const currentBill = invoice.subtotal || invoice.grandTotal;
  const summary = [`<div>Current Bill Amount: ${rs(currentBill)}</div>`];
  if (invoice.previousBalance > 0)
    summary.push(`<div>Previous Balance: ${rs(invoice.previousBalance)}</div>`);
  if (invoice.discountAmount > 0) summary.push(`<div>Discount Amount: -${rs(invoice.discountAmount)}</div>`);
  summary.push(`<div class="bold">Total Amount: ${rs(invoice.grandTotal)}</div>`);
  summary.push(`<div>Amount Paid: ${rs(invoice.amountPaid || 0)}</div>`);
  if (balanceReturns > 0)
    summary.push(`<div class="bold red">Returns (adjusted): -${rs(balanceReturns)}</div>`);
  if (refundedReturns > 0) summary.push(`<div class="bold">Returns (refunded): ${rs(refundedReturns)}</div>`);
  if (balanceReturns > 0) {
    summary.push(`<div class="bold">Adjusted Balance Due: ${rs(adjustedBalanceDue)}</div>`);
  } else {
    summary.push(`<div class="bold">Balance Due: ${rs(adjustedBalanceDue)}</div>`);
  }
  const partyInfoHtml = `
    <div class="section">${esc(party.toUpperCase())} INFORMATION</div>
    <div class="info">Name: ${esc(invoice.partyName)}</div>
    <div class="info">Invoice No: ${esc(displayInvoiceNo(labels, invoice.invoiceNo))}</div>
    <div class="info">Address: ${esc(invoice.partyAddress || NOT_SPECIFIED)}</div>
    <div class="info">Phone: ${esc(invoice.partyPhone || NOT_SPECIFIED)}</div>
    <div class="info">Invoice Date: ${esc(formatDateIN(invoice.invoiceDate))}</div>
  `;
  const body = `
    <div class="title green">ACCOUNT STATEMENT</div>


    <div class="section underlined">INVOICE DETAILS</div>
    ${productsTable(invoice)}
    <div class="summary">${summary.join('')}</div>

    ${
      totalReturns > 0
        ? `<div class="section">RETURN INFORMATION</div>${returns.length > 0 ? returnsTable(returns) : ''}`
        : ''
    }

    <div class="section">PAYMENT HISTORY</div>
    ${paymentsTable(payments, invoice.grandTotal, balanceReturns, refundedReturns, todayOf(now), labels)}

    ${footer(now, true)}`;
  return wrap(
    `SS ${displayInvoiceNo(labels, invoice.invoiceNo)}`,
    `SS ${displayInvoiceNo(labels, invoice.invoiceNo)}`,
    logoSrc,
    partyInfoHtml,
    body,
  );
}
/**
 * generateCombinedPDFStatement(): every invoice of the party (newest first) with its returns and payment history,
 * then the party's totals and outstanding balance (the ledger figure from buildCombinedStatement).
 */
export function buildCombinedStatementHtml({ statement, labels, logoSrc, now }) {
  const today = todayOf(now);
  const blocks = statement.invoices
    .map((invoice, index) => {
      const hasReturns = invoice.totalReturns > 0 && invoice.returns.length > 0;
      return `
      <div class="invoice-block">
        <div class="section underlined">INVOICE NO ${esc(displayInvoiceNo(labels, invoice.invoiceNo))} - ${esc(formatDateIN(invoice.invoiceDate))}</div>
        ${productsTable(invoice)}
        ${hasReturns ? `<div class="section">RETURN INFORMATION</div>${returnsTable(invoice.returns)}` : ''}
        ${
          invoice.payments.length > 0
            ? `<div class="section">PAYMENT HISTORY</div>${paymentsTable(invoice.payments, invoice.grandTotal, balanceReturnsOf(invoice), refundedReturnsOf(invoice), today, labels)}`
            : ''
        }
        <div class="summary">${
          balanceReturnsOf(invoice) > 0
            ? `<div class="bold">Adjusted Balance Due: ${rs(invoiceDue(invoice))}</div>`
            : `<div class="bold">Balance Due: ${rs(invoiceDue(invoice))}</div>`
        }</div>
        ${index < statement.invoices.length - 1 ? '<div class="separator"></div>' : ''}
      </div>`;
    })
    .join('');
  const { totals } = statement;
  const totalRows = [
    totals.opening
      ? `<div class="row"><span>Opening Balance:</span><span>${esc(rs(totals.opening))}</span></div>`
      : '',
    `<div class="row"><span>Total Billed:</span><span>${esc(rs(totals.totalBilled))}</span></div>`,
    `<div class="row"><span>Total Paid:</span><span>${esc(rs(totals.totalPaid))}</span></div>`,
    totals.balanceReturns > 0
      ? `<div class="row"><span>Returns (adjusted):</span><span>-${esc(rs(totals.balanceReturns))}</span></div>`
      : '',
    totals.refundedReturns > 0
      ? `<div class="row"><span>Returns (refunded):</span><span>${esc(rs(totals.refundedReturns))}</span></div>`
      : '',
    `<div class="row final"><span>Outstanding Balance:</span><span>${esc(rs(totals.outstanding))}</span></div>`,
  ].join('');
  const partyInfoHtml = `
    <div class="section">${esc(labels.party.toUpperCase())} INFORMATION</div>
    <div class="info">Name: ${esc(statement.partyName)}</div>
    <div class="info">Phone: ${esc(statement.partyPhone || NOT_SPECIFIED)}</div>
    <div class="info">Address: ${esc(statement.partyAddress || NOT_SPECIFIED)}</div>
  `;
  const body = `
    <div class="title green">COMBINED ACCOUNT STATEMENT</div>
    <div style="height: 10px"></div>
    ${blocks}
    <div class="totals">${totalRows}</div>
    ${footer(now, true)}`;
  return wrap(statementTitle(statement.partyName), statementWatermark(), logoSrc, partyInfoHtml, body);
}
/**
 * generateCombinedPDFStatementEasy(): the party's opening balance, one ledger line per invoice (oldest first) and the
 * totals; Balance Due is the ledger outstanding when `outstanding` is given. Null when empty.
 */
export function buildEasyStatementHtml({ partyName, invoices, labels, logoSrc, now, opening, outstanding }) {
  const easy = buildEasyStatement(invoices, { opening, outstanding });
  if (!easy) return null;
  const notes = (row) =>
    [
      row.discount > 0 ? `(Discount: -${esc(rs(row.discount))})` : '',
      row.returnsDeducted > 0 ? `(Returns deducted: -${esc(rs(row.returnsDeducted))})` : '',
      row.returnsRefunded > 0 ? `(Returns refunded: ${esc(rs(row.returnsRefunded))})` : '',
    ].filter(Boolean);
  const rows = easy.rows.map((row) => [
    esc(displayInvoiceNo(labels, row.invoiceNo)),
    esc(formatDateIN(row.invoiceDate)),
    [esc(row.particulars), ...notes(row)].join('<br />'),
    formatCurrency(row.amount),
    formatCurrency(row.received),
  ]);
  if (easy.opening) rows.unshift(['', '', 'Opening Balance', formatCurrency(easy.opening), '']);
  const partyInfoHtml = `
    <div class="section">${esc(labels.party.toUpperCase())} INFORMATION</div>
    <div class="info">Name: ${esc(partyName)}</div>
    <div class="info">Phone: ${esc(easy.partyPhone || NOT_SPECIFIED)}</div>
    <div class="info">Address: ${esc(easy.partyAddress || NOT_SPECIFIED)}</div>
  `;
  const body = `
    <div class="title black">COMBINED ACCOUNT STATEMENT</div>
    <div style="height: 10px"></div>
    ${table(
      [
        ['Invoice No', 'l'],
        ['Date', 'l'],
        ['Particulars', 'l'],
        ['Amount', 'r'],
        ['Received', 'r'],
      ],
      rows,
      'plain',
    )}
    <div class="totals">
      ${easy.opening ? `<div class="row"><span>Opening Balance:</span><span>${esc(rs(easy.opening))}</span></div>` : ''}
      <div class="row"><span>Total Amount:</span><span>${esc(rs(easy.totalBill))}</span></div>
      <div class="row"><span>Total Received:</span><span>${esc(rs(easy.totalPaid))}</span></div>
      ${easy.totalReturns > 0 ? `<div class="row"><span>Returns Deducted:</span><span>-${esc(rs(easy.totalReturns))}</span></div>` : ''}
      <div class="row final"><span>Balance Due:</span><span>${esc(rs(easy.balanceDue))}</span></div>
    </div>
    ${footer(now, false)}`;
  return wrap(statementTitle(partyName), statementWatermark(), logoSrc, partyInfoHtml, body);
}
// ------------------------------------------------------------------ file names
const sanitize = (text) => text.replace(/[^a-zA-Z0-9]/g, '_');
export const combinedStatementFileName = (partyName, now) =>
  `SS_${sanitize(partyName)}_${toISODate(now)}.pdf`;
export const easyStatementFileName = (partyName, now) =>
  `SS_Easy_${sanitize(partyName)}_${toISODate(now)}.pdf`;
/** The web kept the party name verbatim; characters a file system rejects are replaced. */
export const invoiceStatementFileName = (invoiceNo, partyName, now) =>
  `SS_${invoiceNo}_${partyName}_${toISODate(now)}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
