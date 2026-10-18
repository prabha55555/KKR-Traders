import { db } from '@/core/db';
import {
  filterShortcuts,
  normaliseShortcut,
  SHORTCUT_KEY_MAX_LENGTH,
  SHORTCUT_REQUIRED_MESSAGE,
  titleCaseDescription,
} from '@/features/overview/shortcuts/shortcutsLogic';
import { updateShortcut } from '@/features/overview/shortcuts/shortcutsService';
afterEach(() => jest.restoreAllMocks());
describe('titleCaseDescription', () => {
  test('every space-separated word: first letter upper, rest lower', () => {
    expect(titleCaseDescription('lycra DERBY')).toBe('Lycra Derby');
    expect(titleCaseDescription('  single jersey 24S ')).toBe('Single Jersey 24s');
  });
  test('repeated spaces are kept, as split(" ") does on the web', () => {
    expect(titleCaseDescription('loop  knit')).toBe('Loop  Knit');
  });
  test('blank stays blank', () => expect(titleCaseDescription('   ')).toBe(''));
});
describe('normaliseShortcut', () => {
  test('key is trimmed and UPPERCASE, description Title Case', () => {
    expect(normaliseShortcut(' ly d ', 'lycra derby')).toEqual({
      shortcutKey: 'LY D',
      fullDescription: 'Lycra Derby',
    });
    expect(normaliseShortcut('Lk', 'LOOPKNIT')).toEqual({ shortcutKey: 'LK', fullDescription: 'Loopknit' });
  });
  test('both fields are required', () => {
    expect(normaliseShortcut('', 'x')).toBeNull();
    expect(normaliseShortcut('  ', 'x')).toBeNull();
    expect(normaliseShortcut('k', '   ')).toBeNull();
    expect(SHORTCUT_REQUIRED_MESSAGE).toBe('Please enter both shortcut key and full description');
    expect(SHORTCUT_KEY_MAX_LENGTH).toBe(20);
  });
});
describe('filterShortcuts', () => {
  const list = [
    { shortcutKey: 'LK', fullDescription: 'Loopknit' },
    { shortcutKey: 'LY D', fullDescription: 'Lycra Derby' },
    { shortcutKey: 'SJ', fullDescription: 'Single Jersey' },
  ];
  const keys = (q) => filterShortcuts(list, q).map((s) => s.shortcutKey);
  test('matches the key or the description, case-insensitively', () => {
    expect(keys('lk')).toEqual(['LK']);
    expect(keys('JERSEY')).toEqual(['SJ']);
    expect(keys('ly')).toEqual(['LY D']);
    expect(keys('l')).toEqual(['LK', 'LY D', 'SJ']); // "Single" contains an l
    expect(keys('zzz')).toEqual([]);
  });
  test('empty query -> everything', () => {
    expect(filterShortcuts(list, '')).toBe(list);
    expect(keys('  ')).toEqual(['LK', 'LY D', 'SJ']);
  });
});
describe('updateShortcut', () => {
  const edited = { shortcutKey: 'NEW', fullDescription: 'Fine Cotton' };
  test('changed key: delete the old document first, then save the new one', async () => {
    const del = jest.spyOn(db, 'deleteShortcut').mockResolvedValue();
    const save = jest.spyOn(db, 'saveShortcut').mockResolvedValue('NEW');
    await updateShortcut('OLD', edited);
    expect(del).toHaveBeenCalledWith('OLD');
    expect(save).toHaveBeenCalledWith(edited);
    expect(del.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0]);
  });
  test('same key (only the description changed): just save over the document', async () => {
    const del = jest.spyOn(db, 'deleteShortcut').mockResolvedValue();
    const save = jest.spyOn(db, 'saveShortcut').mockResolvedValue('NEW');
    await updateShortcut('NEW', edited);
    expect(del).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(edited);
  });
  test('a failing delete stops before anything is saved', async () => {
    jest.spyOn(db, 'deleteShortcut').mockRejectedValue(new Error('offline'));
    const save = jest.spyOn(db, 'saveShortcut').mockResolvedValue('NEW');
    await expect(updateShortcut('OLD', edited)).rejects.toThrow('offline');
    expect(save).not.toHaveBeenCalled();
  });
});
