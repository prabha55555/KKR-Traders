/**
 * Turning statement HTML into something the user can use: a PDF handed to the device's share sheet where the browser
 * supports file sharing (phones, tablets), otherwise the browser print dialog ("Save as PDF" / print).
 */
import { printHtml, sharePdfHtml } from '@/platform';

/** Opens the print dialog for the statement. */
export async function printStatementHtml(html) {
  await printHtml(html);
}

/** Builds the PDF and opens the share sheet: 'shared' (sent or closed by the user) | 'unavailable' (print instead). */
export async function shareStatementPdf(html, fileName, title) {
  return sharePdfHtml(html, fileName, title);
}

/** Kept for API parity with the mobile build; the browser prints directly. */
export async function createStatementPdf() {
  throw new Error('PDF files are produced through the browser print dialog.');
}
