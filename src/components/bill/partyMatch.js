/**
 * Pure helpers for the phone-driven party (customer / supplier) picker.
 * A party is `{ phone, name, address }`; the phone is the document id.
 */

export const MAX_PARTY_SUGGESTIONS = 6;

/** Exact match on the phone number. */
export function findPartyByPhone(parties, phone) {
  const wanted = (phone ?? '').trim();
  return parties?.find((p) => p.phone === wanted) ?? null;
}

/** Parties whose phone or name contains what was typed, excluding an exact phone match (applied on its own). */
export function suggestParties(parties, typedPhone, limit = MAX_PARTY_SUGGESTIONS) {
  const typed = (typedPhone ?? '').trim();
  const query = typed.toLowerCase();
  if (!query || !parties) return [];
  return parties
    .filter(
      (p) => (p.phone || '').toLowerCase().includes(query) || (p.name || '').toLowerCase().includes(query),
    )
    .filter((p) => p.phone !== typed)
    .slice(0, limit);
}

/** Enter in the phone box: the exact match wins, otherwise the top suggestion. */
export function partyToPickOnEnter(parties, typedPhone) {
  return findPartyByPhone(parties, typedPhone) ?? suggestParties(parties, typedPhone)[0] ?? null;
}
