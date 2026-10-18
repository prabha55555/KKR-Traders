/**
 * Printable invoice HTML — ported from the web app's PDFGenerator.generateHTMLContent.
 * Pure string builder (no platform APIs) so it is unit-testable and renders in any browser (and in the print dialog).
 */
import { COMPANY } from '@/core/branding';
import { formatCurrency, formatDateIN, numberToWords } from '@/core/format';
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
/** Address / phone / e-mail / website line for the invoice header — empty details are left out. */
function companyContactLine() {
  const parts = [
    COMPANY.address && esc(COMPANY.address),
    COMPANY.cell && `<span style="white-space: nowrap;">CELL: ${esc(COMPANY.cell)}</span>`,
    COMPANY.email && esc(COMPANY.email),
    COMPANY.website && esc(COMPANY.website),
  ].filter(Boolean);
  return parts.length ? `<p>${parts.join(' | ')}</p>` : '';
}
const CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 24px; background: #fff; position: relative; color: #333; }
  .invoice-container { position: relative; z-index: 2; }
  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 96px; color: rgba(200,200,200,0.15); font-weight: 900; white-space: pre; text-align: center; z-index: 0; }
  .invoice-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #444; padding-bottom: 12px; margin-bottom: 18px; gap: 8px; }
  .company-info { flex: 1; text-align: left; }
  .company-details h2 { margin: 0; color: #2c3e50; font-size: 16px; }
  .company-details p { margin: 3px 0; font-size: 10px; }
  .logo-container { flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .logo-container .tagline { font-size: 10px; margin-bottom: 4px; font-weight: bold; white-space: nowrap; }
  .logo-container img { max-width: 130px; height: auto; }
  .invoice-title { flex: 1; text-align: right; }
  .invoice-title h2 { margin: 0; color: #2c3e50; font-size: 14px; text-transform: uppercase; }
  .invoice-title div { font-size: 12px; margin-top: 4px; }
  .billing-info { margin-bottom: 16px; }
  .bill-to { border: 1px solid #555; padding: 6px 10px; border-radius: 6px; background: #f4f4f4; font-weight: 600; color: #222; line-height: 1.3; }
  .bill-to h3 { margin: 0 0 5px 0; color: #111; font-size: 13px; font-weight: 700; text-transform: uppercase; }
  .bill-to p { margin: 2px 0; font-size: 12px; color: #111; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #ccc; text-align: center; padding: 6px; font-size: 12px; }
  th { background: wheat; color: #1c1b1b; }
  .return-table { margin-top: 16px; }
  .return-table h4 { margin: 0 0 8px 0; color: #2c3e50; font-size: 13px; text-align: center; background: #fff4e6; padding: 6px; border-radius: 4px; border-left: 4px solid #f39c12; }
  .calculation-section { margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
  .amount-in-words { flex: 1; padding: 12px; border: 1px solid #ccc; border-radius: 8px; background: #fdfdfd; }
  .amount-in-words p { margin: 0 0 5px 0; font-size: 12px; }
  .payment-calculation { width: 260px; border: 1px solid #ccc; padding: 8px 12px; border-radius: 8px; background: #fdfdfd; }
  .payment-calculation h3 { margin-top: 0; text-align: center; font-size: 14px; font-weight: bold; background: #2c3e50; color: #fff; padding: 5px 0; border-radius: 6px; }
  .payment-row { display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px; }
  .payment-row.total { font-weight: bold; border-top: 1px solid #333; padding-top: 6px; }
  .amount-return { color: #e74c3c; font-weight: bold; }
  .amount-negative { color: #111; font-weight: bold; }
  .amount-positive { color: #27ae60; font-weight: bold; }
  .return-box { margin-top: 16px; padding: 8px 12px; background: #fff4e6; border-left: 4px solid #f39c12; font-size: 12px; border-radius: 5px; }
  .signature-section { display: flex; justify-content: space-between; margin-top: 40px; font-size: 11px; gap: 8px; }
  .signature-line { border-top: 1px solid #333; margin: 35px auto 8px; width: 140px; }
  .declaration { flex: 1; }
  .customer-signature, .company-signature { text-align: center; flex: 1; }
  .developer-credit-print { text-align: center; margin-top: 18px; font-size: 10px; color: #555; border-top: 2px dashed #eee; padding-top: 10px; page-break-inside: avoid; }
  .manual-bill-page { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 95vh; page-break-inside: avoid; }
  .manual-bill-header { width: 100%; border-bottom: 2px solid #444; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
  .manual-bill-title { font-size: 16px; font-weight: bold; color: #2c3e50; text-transform: uppercase; }
  .manual-bill-subtitle { font-size: 12px; color: #666; }
  .manual-bill-img-box { width: 100%; flex: 1; display: flex; justify-content: center; align-items: center; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa; }
  .manual-bill-img { max-width: 100%; max-height: 800px; object-fit: contain; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
`;
/** One page (ORIGINAL or COPY) of the invoice. */
export function invoiceBody(input) {
  const {
    invoice,
    totalReturns = 0,
    adjustedBalanceDue = 0,
    returns = [],
    payments = [],
    accountBankName = '',
    copyType = 'BOTH',
    logoSrc = '',
  } = input;
  const pb = invoice.paymentBreakdown;
  const showReturns = totalReturns > 0 && returns.length > 0;
  const showPayments = payments && payments.length > 0;
  const productRows = invoice.products
    .map(
      (p, i) => `
        <tr>
          <td>${p.sno ?? i + 1}</td>
          <td>${esc(p.description)}</td>
          <td>${esc(p.qty)}</td>
          <td>${formatCurrency(p.rate)}</td>
          <td>${formatCurrency(p.amount)}</td>
        </tr>`,
    )
    .join('');
  const returnRows = returns
    .map(
      (r) => `
        <tr>
          <td>${formatDateIN(r.returnDate)}</td>
          <td>${esc(r.description)}</td>
          <td>${esc(r.qty)}</td>
          <td>${formatCurrency(r.rate)}</td>
          <td>${formatCurrency(r.returnAmount)}</td>
        </tr>`,
    )
    .join('');
  const paymentRows = (payments || [])
    .map((p, i) => {
      const rawMethod = (p.paymentMethod || 'cash').toLowerCase();
      let methodText = 'Cash in Hand';
      if (rawMethod === 'account') {
        methodText = p.bankAccountName ? `Account: ${esc(p.bankAccountName)}` : 'Bank Account';
      } else if (rawMethod === 'upi') {
        methodText = p.bankAccountName ? `UPI (${esc(p.bankAccountName)})` : 'UPI';
      }
      const typeBadge = p.paymentType === 'additional' ? ' (Additional)' : '';
      return `
        <tr>
          <td style="text-align: center;">${i + 1}</td>
          <td style="text-align: center;">${formatDateIN(p.paymentDate)}</td>
          <td>${methodText}${typeBadge}</td>
          <td style="text-align: right;">Rs. ${formatCurrency(p.amount)}</td>
        </tr>`;
    })
    .join('');
  const accountLabel = accountBankName ? `Account Paid (${esc(accountBankName)}):` : 'Account Paid:';
  const legacyMethod =
    invoice.paymentMethod === 'cash' ? 'CASH' : invoice.paymentMethod === 'upi' ? 'UPI' : 'ACCOUNT';
  return `
  <div class="watermark">${esc(COMPANY.monogram)} ${esc(invoice.invoiceNo)}</div>
  <div class="invoice-container">
    <div class="invoice-header">
      <div class="company-info">
        <div class="company-details">
          <h2>${COMPANY.name}</h2>
          ${companyContactLine()}
        </div>
      </div>
      <div class="logo-container">
        <div class="tagline">${COMPANY.tagline}</div>
        ${logoSrc ? `<img src="${logoSrc}" alt="${COMPANY.displayName} Logo" />` : ''}
      </div>
      <div class="invoice-title">
        <h2>ESTIMATED COPY <br><span style="font-size: 11px; color: #777;">(${copyType === 'BOTH' ? 'ORIGINAL' : copyType})</span></h2>
        <div><strong>Invoice No:</strong> ${esc(invoice.invoiceNo)}</div>
        <div><strong>Date:</strong> ${formatDateIN(invoice.invoiceDate)}</div>
      </div>
    </div>

    <div class="billing-info">
      <div class="bill-to">
        <h3>BILL TO</h3>
        <p>Name: ${esc(invoice.customerName)}</p>
        <p>Address: ${esc(invoice.customerAddress || '-')}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 8%">S.No.</th>
          <th style="width: 52%">Product Description</th>
          <th style="width: 10%">Qty</th>
          <th style="width: 15%">Rate (Rs.)</th>
          <th style="width: 15%">Amount (Rs.)</th>
        </tr>
      </thead>
      <tbody>${productRows}</tbody>
    </table>

    ${
      showReturns
        ? `
    <div class="return-table">
      <h4>RETURN INFORMATION</h4>
      <table>
        <thead>
          <tr>
            <th style="width: 15%">Date</th>
            <th style="width: 45%">Product</th>
            <th style="width: 10%">Qty</th>
            <th style="width: 15%">Rate (Rs.)</th>
            <th style="width: 15%">Amount (Rs.)</th>
          </tr>
        </thead>
        <tbody>
          ${returnRows}
          <tr style="background: #fff4e6; font-weight: bold;">
            <td colspan="4" style="text-align: right;">Total Return Amount:</td>
            <td>Rs. ${formatCurrency(totalReturns)}</td>
          </tr>
        </tbody>
      </table>
    </div>`
        : ''
    }

    ${
      showPayments
        ? `
    <div class="product-section" style="margin-top: 15px;">
      <div class="section-title">PAYMENT DETAILS</div>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 8%; text-align: center;">#</th>
            <th style="width: 24%; text-align: center;">Date</th>
            <th style="width: 43%;">Payment Method</th>
            <th style="width: 25%; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRows}
        </tbody>
      </table>
    </div>`
        : ''
    }

    <div class="calculation-section">
      <div class="amount-in-words">
        <p><strong>Amount in words:</strong></p>
        <p style="margin-bottom: 12px; font-style: italic;">${numberToWords(invoice.grandTotal)}</p>
        ${COMPANY.gpay ? `<p style="margin: 0; font-weight: bold; font-size: 13px;">G-pay No : ${esc(COMPANY.gpay)}</p>` : ''}
      </div>
      <div class="payment-calculation">
        <h3>PAYMENT SUMMARY</h3>
        <div class="payment-row"><span>Subtotal:</span><span>Rs. ${formatCurrency(invoice.subtotal)}</span></div>
        <div class="payment-row"><span>Previous Balance:</span><span>Rs. ${formatCurrency(invoice.previousBalance || 0)}</span></div>
        ${
          invoice.manualPreviousBalance
            ? `<div class="payment-row"><span>Opening Balance:</span><span>Rs. ${formatCurrency(invoice.manualPreviousBalance)}</span></div>`
            : ''
        }
        <div class="payment-row total"><span>Total Amount:</span><span>Rs. ${formatCurrency(invoice.grandTotal)}</span></div>
        ${
          pb
            ? `
        <div class="payment-row"><span>Cash Paid:</span><span>Rs. ${formatCurrency(pb.cash || 0)}</span></div>
        <div class="payment-row"><span>UPI Paid:</span><span>Rs. ${formatCurrency(pb.upi || 0)}</span></div>
        <div class="payment-row"><span>${accountLabel}</span><span>Rs. ${formatCurrency(pb.account || 0)}</span></div>
        <div class="payment-row total-paid"><span>Total Amount Paid:</span><span>Rs. ${formatCurrency(invoice.amountPaid)}</span></div>`
            : `
        <div class="payment-row"><span>Amount Paid:</span><span>Rs. ${formatCurrency(invoice.amountPaid)}</span></div>
        <div class="payment-row"><span>Payment Method:</span><span style="font-weight: bold; color: ${invoice.paymentMethod === 'cash' ? '#27ae60' : '#3498db'};">${legacyMethod}</span></div>`
        }
        ${
          totalReturns > 0
            ? `<div class="payment-row"><span>Return Amount:</span><span class="amount-return">-Rs. ${formatCurrency(totalReturns)}</span></div>`
            : ''
        }
        <div class="payment-row" style="font-weight: bold; color: #111;">
          <span>${totalReturns > 0 ? 'Adjusted Balance Due:' : 'Balance Due:'}</span>
          <span class="${adjustedBalanceDue > 0 ? 'amount-negative' : 'amount-positive'}">Rs. ${formatCurrency(totalReturns > 0 ? adjustedBalanceDue : invoice.balanceDue)}</span>
        </div>
      </div>
    </div>

    ${
      totalReturns > 0
        ? `<div class="return-box"><strong>RETURN INFORMATION:</strong> This invoice has processed returns amounting to Rs. ${formatCurrency(totalReturns)}. The balance due has been adjusted accordingly.</div>`
        : ''
    }

    <div class="signature-section">
      <div class="declaration">
        <p>Certified that the particulars given above are true and correct</p>
        <p>**TERMS &amp; CONDITIONS APPLY</p>
        <p>**E. &amp; O.E.</p>
      </div>
      <div class="customer-signature">
        <p>Agreed and accepted</p>
        <p class="signature-line"></p>
        <p>CUSTOMER SIGNATURE</p>
      </div>
      <div class="company-signature">
        <p>For ${COMPANY.name}</p>
        <p class="signature-line"></p>
        <p>AUTHORIZED SIGNATORY</p>
      </div>
    </div>

    <div class="developer-credit-print" style="margin-top: 10px; font-size: 13px; font-weight: bold; color: #1b2030;">
      <p style="margin: 3px 0;">
        Software created by Sabarish R.
        <span style="color: #666; margin: 0 5px; font-weight: normal;">|</span>
        For custom billing solutions, contact: 7845081278
      </p>
    </div>
  </div>`;
}
/** Attached manual bill slip page */
export function manualBillPage(input) {
  const { invoice } = input;
  if (!invoice.manualBillImage) return '';
  return `
  <div class="watermark">${esc(COMPANY.monogram)} ${esc(invoice.invoiceNo)}</div>
  <div class="manual-bill-page">
    <div class="manual-bill-header">
      <div>
        <div class="manual-bill-title">Manual Bill Attachment</div>
        <div class="manual-bill-subtitle">${esc(COMPANY.name)}</div>
      </div>
      <div style="text-align: right;">
        <div><strong>Invoice No:</strong> ${esc(invoice.invoiceNo)}</div>
        <div style="font-size: 11px; color: #555;"><strong>Party:</strong> ${esc(invoice.customerName || 'N/A')}</div>
      </div>
    </div>
    <div class="manual-bill-img-box">
      <img class="manual-bill-img" src="${invoice.manualBillImage}" alt="Manual Bill Slip #${esc(invoice.invoiceNo)}" />
    </div>
  </div>`;
}

function wrap(title, bodies) {
  const validBodies = bodies.filter(Boolean);
  const joined = validBodies.join('<div style="page-break-before: always;"></div>');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${CSS}</style>
</head>
<body>${joined}</body>
</html>`;
}
/** Single page — used for sharing (the web app shared only the ORIGINAL page as a PDF). */
export function buildInvoiceHtml(input) {
  const pages = [invoiceBody(input)];
  if (input.invoice?.manualBillImage) {
    pages.push(manualBillPage(input));
  }
  return wrap(`SS ${input.invoice.invoiceNo}`, pages);
}
export function buildCombinedInvoiceHtml(input) {
  const pages = [
    invoiceBody({ ...input, copyType: 'ORIGINAL' }),
    invoiceBody({ ...input, copyType: 'COPY' }),
  ];
  if (input.invoice?.manualBillImage) {
    pages.push(manualBillPage(input));
  }
  return wrap(`SS ${input.invoice.invoiceNo}`, pages);
}
