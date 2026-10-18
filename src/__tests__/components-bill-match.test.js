import { describe, expect, it } from 'vitest';
import { findPartyByPhone, partyToPickOnEnter, suggestParties } from '@/components/bill/partyMatch';
import { EMPTY_ROW, isKnownProduct, matchShortcuts, removeRowAt } from '@/components/bill/productMatch';

const shortcuts = [
  { shortcutKey: 'SH', fullDescription: 'Cotton Shirt' },
  { shortcutKey: 'TR', fullDescription: 'Track Pant' },
  { shortcutKey: 'SHT', fullDescription: 'Short Sleeve Tee' },
];

describe('matchShortcuts / isKnownProduct', () => {
  it('matches the key or the description, case-insensitively', () => {
    expect(matchShortcuts(shortcuts, 'sh').map((s) => s.shortcutKey)).toEqual(['SH', 'SHT']);
    expect(matchShortcuts(shortcuts, 'pant').map((s) => s.shortcutKey)).toEqual(['TR']);
  });
  it('returns nothing for blank text, a missing catalogue and honours the limit', () => {
    expect(matchShortcuts(shortcuts, '  ')).toEqual([]);
    expect(matchShortcuts(null, 'sh')).toEqual([]);
    expect(matchShortcuts(shortcuts, 'sh', 1)).toHaveLength(1);
  });
  it('accepts only exact catalogue descriptions', () => {
    expect(isKnownProduct(shortcuts, ' cotton shirt ')).toBe(true);
    expect(isKnownProduct(shortcuts, 'Cotton')).toBe(false);
    expect(isKnownProduct(null, 'Cotton Shirt')).toBe(false);
  });
});

describe('removeRowAt', () => {
  it('removes a row and never leaves the table empty', () => {
    const rows = [
      { ...EMPTY_ROW, description: 'a' },
      { ...EMPTY_ROW, description: 'b' },
    ];
    expect(removeRowAt(rows, 0)).toEqual([rows[1]]);
    expect(removeRowAt([rows[0]], 0)).toEqual([EMPTY_ROW]);
  });
});

describe('party helpers', () => {
  const parties = [
    { phone: '9876543210', name: 'SLN TEX', address: 'Tirupur' },
    { phone: '9000000001', name: 'ABC', address: '' },
  ];
  it('finds and suggests parties', () => {
    expect(findPartyByPhone(parties, ' 9000000001 ')?.name).toBe('ABC');
    expect(suggestParties(parties, 'sln').map((p) => p.phone)).toEqual(['9876543210']);
    expect(suggestParties(parties, '9876543210')).toEqual([]);
    expect(partyToPickOnEnter(parties, 'zzz')).toBeNull();
  });
});
