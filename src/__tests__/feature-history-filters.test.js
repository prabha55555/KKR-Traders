import { dayKey, formatDateTimeIN, timeOfDay } from '@/features/history/lib/dates';
import {
  compareNewestFirst,
  filterInvoices,
  invoiceNumber,
  recentInvoices,
} from '@/features/history/lib/filters';
import { filterByDate, getDateWiseStatistics, groupInvoicesByDate } from '@/features/history/lib/grouping';
import { indexByInvoiceNo, latestInvoiceNoPerParty, sumReturnAmounts } from '@/features/history/lib/lookups';
import { EMPTY_FILTERS } from '@/features/history/lib/types';
const row = (invoiceNo, invoiceDate, partyName = 'SLN TEX') => ({ invoiceNo, invoiceDate, partyName });
const party = (r) => r.partyName;
const f = (over) => ({ ...EMPTY_FILTERS, ...over });
const numbers = (rows) => rows.map((r) => r.invoiceNo);
const ROWS = [
  row('001', '2026-09-01', 'SLN TEX'),
  row('002', '2026-09-01', 'Ravi Garments'),
  row('003', '2026-09-15', 'SLN TEX'),
  row('010', '2026-10-03', 'Kumar & Sons'),
  row('011', '2026-10-03', 'ravi garments'),
  row('A12', '2026-10-04', 'No Number'),
];
describe('sorting', () => {
  test('newest date first, then highest invoice number', () => {
    expect(numbers(filterInvoices(ROWS, EMPTY_FILTERS, party))).toEqual([
      'A12',
      '011',
      '010',
      '003',
      '002',
      '001',
    ]);
  });
  test('does not mutate its input', () => {
    const copy = [...ROWS];
    filterInvoices(ROWS, f({ search: 'sln' }), party);
    expect(ROWS).toEqual(copy);
  });
  test('invoiceNumber is parseInt || 0', () => {
    expect(invoiceNumber('012')).toBe(12);
    expect(invoiceNumber('P-5')).toBe(0);
    expect(invoiceNumber('')).toBe(0);
  });
  test('an invoice without a usable date sinks to the end instead of breaking the order', () => {
    const list = [row('001', ''), row('002', '2026-01-01'), row('003', '2026-02-01')];
    expect(list.sort(compareNewestFirst).map((r) => r.invoiceNo)).toEqual(['003', '002', '001']);
  });
});
describe('search filter', () => {
  test('matches the party name case-insensitively (substring)', () => {
    expect(numbers(filterInvoices(ROWS, f({ search: 'RAVI' }), party))).toEqual(['011', '002']);
  });
  test('matches the invoice number (substring), e.g. what tapping a recent invoice does', () => {
    expect(numbers(filterInvoices(ROWS, f({ search: '01' }), party))).toEqual(['011', '010', '001']);
    expect(numbers(filterInvoices(ROWS, f({ search: 'a12' }), party))).toEqual(['A12']);
  });
  test('surrounding spaces are ignored (deviation: the web did not trim)', () => {
    expect(numbers(filterInvoices(ROWS, f({ search: ' ravi ' }), party))).toEqual(['011', '002']);
  });
});
describe('date range filter', () => {
  test('inclusive from / to, either one alone, or both', () => {
    expect(numbers(filterInvoices(ROWS, f({ fromDate: '2026-09-15' }), party))).toEqual([
      'A12',
      '011',
      '010',
      '003',
    ]);
    expect(numbers(filterInvoices(ROWS, f({ toDate: '2026-09-01' }), party))).toEqual(['002', '001']);
    expect(numbers(filterInvoices(ROWS, f({ fromDate: '2026-09-15', toDate: '2026-10-03' }), party))).toEqual(
      ['011', '010', '003'],
    );
  });
  test('invoices without a date never match an active date filter', () => {
    const list = [row('001', ''), row('002', '2026-01-01')];
    expect(numbers(filterInvoices(list, f({ fromDate: '2025-01-01' }), party))).toEqual(['002']);
    expect(numbers(filterInvoices(list, f({ toDate: '2027-01-01' }), party))).toEqual(['002']);
  });
});
describe('invoice number range filter', () => {
  test('from, to, or both (numeric part, inclusive)', () => {
    expect(numbers(filterInvoices(ROWS, f({ fromInvoiceNo: '3' }), party))).toEqual(['011', '010', '003']);
    expect(numbers(filterInvoices(ROWS, f({ toInvoiceNo: '2' }), party))).toEqual(['A12', '002', '001']);
    expect(numbers(filterInvoices(ROWS, f({ fromInvoiceNo: '2', toInvoiceNo: '10' }), party))).toEqual([
      '010',
      '003',
      '002',
    ]);
  });
  test('a non-numeric invoice number counts as 0', () => {
    expect(numbers(filterInvoices(ROWS, f({ toInvoiceNo: '0' }), party))).toEqual(['A12']);
  });
  test('all filters combine with AND', () => {
    const out = filterInvoices(
      ROWS,
      f({ search: 'ravi', fromDate: '2026-10-01', fromInvoiceNo: '5' }),
      party,
    );
    expect(numbers(out)).toEqual(['011']);
  });
});
describe('recentInvoices', () => {
  test('the five highest invoice numbers, highest first', () => {
    const list = ['001', '007', '003', '010', '002', '009', '004'].map((no) => row(no, '2026-01-01'));
    expect(numbers(recentInvoices(list))).toEqual(['010', '009', '007', '004', '003']);
  });
  test('fewer than five is fine; input untouched', () => {
    const list = [row('002', '2026-01-01'), row('001', '2026-01-01')];
    expect(numbers(recentInvoices(list))).toEqual(['002', '001']);
    expect(numbers(list)).toEqual(['002', '001']);
  });
});
describe('groupInvoicesByDate / getDateWiseStatistics / filterByDate', () => {
  const sorted = filterInvoices(ROWS, EMPTY_FILTERS, party);
  test('one group per day, newest day first, with the invoice count', () => {
    const groups = groupInvoicesByDate(sorted);
    expect(groups.map((g) => [g.key, g.date, g.totalInvoices])).toEqual([
      ['2026-10-04', '4/10/2026', 1],
      ['2026-10-03', '3/10/2026', 2],
      ['2026-09-15', '15/9/2026', 1],
      ['2026-09-01', '1/9/2026', 2],
    ]);
    expect(numbers(groups[1].invoices)).toEqual(['011', '010']);
  });
  test('a stored time part does not split a day; undated invoices go last', () => {
    const groups = groupInvoicesByDate([
      row('1', '2026-10-03T09:00:00'),
      row('2', '2026-10-03'),
      row('3', ''),
      row('4', '2026-10-05'),
    ]);
    expect(groups.map((g) => [g.key, g.totalInvoices])).toEqual([
      ['2026-10-05', 1],
      ['2026-10-03', 2],
      ['', 1],
    ]);
    expect(groups[2].date).toBe('No date');
  });
  test('getDateWiseStatistics', () => {
    const stats = getDateWiseStatistics(sorted);
    expect(stats.totalDays).toBe(4);
    expect(stats.overallStats.totalInvoices).toBe(6);
    expect(stats.dateGroups).toHaveLength(4);
  });
  test('filterByDate sets from = to = the day and keeps the other filters', () => {
    expect(filterByDate(f({ search: 'ravi', fromDate: '2020-01-01' }), '2026-10-03')).toEqual(
      f({ search: 'ravi', fromDate: '2026-10-03', toDate: '2026-10-03' }),
    );
    expect(numbers(filterInvoices(ROWS, filterByDate(EMPTY_FILTERS, '2026-10-03'), party))).toEqual([
      '011',
      '010',
    ]);
  });
  test('dayKey', () => {
    expect(dayKey('2026-10-03T23:59:59')).toBe('2026-10-03');
    expect(dayKey('')).toBe('');
    expect(dayKey(undefined)).toBe('');
    expect(dayKey('garbage')).toBe('');
  });
});
describe('lookups', () => {
  test('indexByInvoiceNo groups once', () => {
    const map = indexByInvoiceNo([
      { invoiceNo: '1', v: 'a' },
      { invoiceNo: '2', v: 'b' },
      { invoiceNo: '1', v: 'c' },
    ]);
    expect(map.get('1')?.map((x) => x.v)).toEqual(['a', 'c']);
    expect(map.get('3')).toBeUndefined();
  });
  test('sumReturnAmounts uses parseFloat(x) || 0', () => {
    expect(
      sumReturnAmounts([{ returnAmount: 10.5 }, { returnAmount: '4.5' }, { returnAmount: 'oops' }]),
    ).toBe(15);
  });
  test('latest invoice per party: newest date, then highest number — over ALL invoices', () => {
    const latest = latestInvoiceNoPerParty(ROWS, party);
    expect(latest.get('SLN TEX')).toBe('003');
    expect(latest.get('Ravi Garments')).toBe('002');
    expect(latest.get('ravi garments')).toBe('011');
    expect(latest.get('Kumar & Sons')).toBe('010');
  });
  test('same date: the higher invoice number is the latest', () => {
    const latest = latestInvoiceNoPerParty(
      [row('005', '2026-05-01'), row('007', '2026-05-01'), row('006', '2026-05-01')],
      party,
    );
    expect(latest.get('SLN TEX')).toBe('007');
  });
});
describe('time helpers', () => {
  test('timeOfDay is HH:MM:SS local', () => {
    expect(timeOfDay(new Date(2026, 9, 3, 7, 5, 9))).toBe('07:05:09');
  });
  test('formatDateTimeIN mimics en-IN toLocaleString', () => {
    expect(formatDateTimeIN(new Date(2026, 9, 3, 16, 5, 9))).toBe('3/10/2026, 4:05:09 pm');
    expect(formatDateTimeIN(new Date(2026, 0, 5, 0, 30, 0))).toBe('5/1/2026, 12:30:00 am');
  });
});
