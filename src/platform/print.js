/**
 * Print an HTML document (invoice, statement) through the browser's print dialog — which also offers "Save as PDF".
 * A hidden iframe is used so popup blockers never get in the way.
 */
export function printHtml(html) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
    });

    const cleanup = () => setTimeout(() => frame.remove(), 1500);
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error('Could not open the print preview.'));
        return;
      }
      // let images (logo) finish decoding before the dialog opens
      setTimeout(() => {
        try {
          win.focus();
          win.print();
          resolve();
        } catch (e) {
          reject(e);
        } finally {
          cleanup();
        }
      }, 400);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
