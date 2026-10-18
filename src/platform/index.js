/**
 * Platform adapters. Everything that touches the browser (print, download, share sheet, clipboard, links, storage)
 * lives here and nowhere else in `core/`. Keeping them in one place makes the rest of the code easy to test and reuse.
 */
export { copyText } from './clipboard';
export { downloadFile } from './files';
export { openExternal } from './links';
export { sharePdfHtml } from './pdf';
export { printHtml } from './print';
export { shareFile, shareText } from './share';
export { storage } from './storage';
