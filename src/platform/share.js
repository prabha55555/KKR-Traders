/**
 * Native share sheet (Web Share API: Android Chrome, iOS Safari, Windows/macOS Edge/Safari).
 * Resolves 'shared' | 'dismissed' | 'unavailable' so callers can fall back (clipboard, wa.me link).
 */
export async function shareText(message, title) {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unavailable';
  try {
    await navigator.share({ text: message, title });
    return 'shared';
  } catch (e) {
    return e?.name === 'AbortError' ? 'dismissed' : 'unavailable';
  }
}

/** Share a File (e.g. a PDF) when the browser supports file sharing. */
export async function shareFile(file, title) {
  if (typeof navigator === 'undefined' || !navigator.canShare?.({ files: [file] })) return 'unavailable';
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (e) {
    return e?.name === 'AbortError' ? 'dismissed' : 'unavailable';
  }
}
