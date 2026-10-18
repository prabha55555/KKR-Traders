/** Browser download of generated text / blobs (CSV exports, backups …). */
export function downloadFile(fileName, content, mimeType = 'text/plain') {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
