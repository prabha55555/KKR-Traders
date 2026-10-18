/** Open an external URL (wa.me, tel:, …) in a new tab / the system handler. */
export async function openExternal(url) {
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  // Popup blocked (e.g. called after an await): navigate this tab instead — the PWA state is persisted in Firestore.
  if (!w) window.location.href = url;
}
