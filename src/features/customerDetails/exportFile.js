/** Hands a built export to the user as a browser download (like the original page). */
import { downloadFile } from '@/platform';

/** Resolves true once the download was triggered. */
export async function saveAndShareExport(file) {
  downloadFile(file.fileName, file.content, file.mimeType);
  return true;
}
