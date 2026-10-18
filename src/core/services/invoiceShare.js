/**
 * Print / share for sales invoices (the original used window.print + a wa.me link).
 *  - printInvoice():     browser print dialog (also "Save as PDF") — ORIGINAL page + slip image (if present)
 *  - shareInvoicePdf():  print dialog / share sheet, then opens customer's WhatsApp — ORIGINAL page + slip image (if present)
 */
import logoUrl from '@/assets/brand/logo.png';
import { formatInvoiceNo } from '@/core/format';
import { printHtml, sharePdfHtml } from '@/platform';
import { loadInvoiceContext } from './invoiceContext';
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
  return { ...(await loadInvoiceContext(invoice)), logoSrc: await getLogoSrc() };
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
  const shownNo = formatInvoiceNo(invoice.invoiceNo);
  if ((await sharePdfHtml(html, `SS ${shownNo}.pdf`, `SS ${shownNo}`)) === 'shared') return 'shared';
  await printHtml(html);
  if (normalizeWhatsAppPhone(invoice.customerPhone)) await openWhatsApp(invoice.customerPhone);
  return 'fallback';
}
