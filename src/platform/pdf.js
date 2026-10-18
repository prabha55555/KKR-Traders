import { shareFile } from './share';

const PAGE_WIDTH_PX = 794; // A4 at 96 dpi

/** true when this browser can hand a PDF file to its share sheet (checked before the costly rendering). */
export function canSharePdf() {
  try {
    const probe = new File(['%PDF'], 'probe.pdf', { type: 'application/pdf' });
    return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

/** Renders an HTML document (invoice / statement) into an A4 PDF `File`. Libraries load on first use only. */
export async function htmlToPdfFile(html, fileName) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${PAGE_WIDTH_PX}px`,
    height: '1123px',
    border: '0',
  });
  try {
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
      frame.srcdoc = html;
      document.body.appendChild(frame);
    });
    const doc = frame.contentDocument;
    await doc.fonts?.ready;
    await Promise.all(
      [...doc.images].map((img) =>
        img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)),
      ),
    );
    const root = doc.body;
    const canvas = await html2canvas(root, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: PAGE_WIDTH_PX,
    });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL('image/jpeg', 0.92);
    let offset = 0;
    pdf.addImage(img, 'JPEG', 0, 0, pageW, imgH);
    while (imgH - offset > pageH + 0.5) {
      offset += pageH;
      pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, -offset, pageW, imgH);
    }
    const name = /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`;
    return new File([pdf.output('blob')], name, { type: 'application/pdf' });
  } finally {
    frame.remove();
  }
}

/**
 * Generate the PDF of `html` and open the device's share sheet with it.
 * Resolves 'shared' (sent, or the user closed the sheet) or 'unavailable' (no file sharing / rendering failed) so the
 * caller can fall back to the print dialog.
 */
export async function sharePdfHtml(html, fileName, title) {
  if (!canSharePdf()) return 'unavailable';
  try {
    const file = await htmlToPdfFile(html, fileName);
    const result = await shareFile(file, title);
    return result === 'unavailable' ? 'unavailable' : 'shared';
  } catch (e) {
    console.warn('Could not create the PDF to share', e);
    return 'unavailable';
  }
}
