import {
  digitsOnly,
  formatAmountToText,
  formatCurrency,
  formatDateIN,
  formatDateShort,
  getFinancialYear,
  numberToWords,
  toISODate,
  toNum,
} from '@/core/format';
describe('formatCurrency (must equal the web app: Intl en-IN, 2 decimals)', () => {
  const intl = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const samples = [
    0,
    1,
    12,
    123,
    999,
    1000,
    1234.5,
    12345.678,
    99999.99,
    100000,
    1234567.891,
    12345678.9,
    987654321.12,
    -1,
    -1234.5,
    -1234567.891,
    0.005,
    0.004,
    1.005,
    2.675,
    10.005,
    1e-7,
    100.1 + 200.2,
    0.1 + 0.2,
  ];
  test.each(samples)('matches Intl for %p', (n) => {
    expect(formatCurrency(n)).toBe(intl.format(n));
  });
  test('coerces junk to 0.00 like the web app', () => {
    expect(formatCurrency('abc')).toBe('0.00');
    expect(formatCurrency(undefined)).toBe('0.00');
    expect(formatCurrency(null)).toBe('0.00');
    expect(formatCurrency('1234.5')).toBe('1,234.50');
  });
  test('never prints a negative zero', () => {
    expect(formatCurrency(-0.001)).toBe('0.00');
  });
});
describe('numberToWords', () => {
  test.each([
    [0, 'Zero'],
    [1, 'Rupees One Only'],
    [21, 'Rupees Twenty One Only'],
    [100, 'Rupees One Hundred Only'],
    [1250, 'Rupees One Thousand Two Hundred Fifty Only'],
    [100000, 'Rupees One Lakh Only'],
    [1234567, 'Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Only'],
    [10000000, 'Rupees One Crore Only'],
    [250.6, 'Rupees Two Hundred Fifty One Only'],
  ])('%p -> %s', (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });
  test('NaN yields empty string', () => expect(numberToWords(NaN)).toBe(''));
  test('negative totals are labelled instead of printing garbage', () =>
    expect(numberToWords(-50)).toBe('Rupees Minus Fifty Only'));
});
describe('formatAmountToText', () => {
  test.each([
    [500, ''],
    [1000, '1 K'],
    [1500, '1.50 K'],
    [250000, '2.50 L'],
    [10000000, '1 Cr'],
    [-250000, '-2.50 L'],
  ])('%p -> %p', (n, out) => expect(formatAmountToText(n)).toBe(out));
});
describe('dates', () => {
  test('formatDateIN matches toLocaleDateString("en-IN") (unpadded d/M/yyyy)', () => {
    expect(formatDateIN('2026-10-03')).toBe('3/10/2026');
    expect(formatDateIN('2026-01-05')).toBe('5/1/2026');
    expect(formatDateIN('2026-12-25')).toBe('25/12/2026');
  });
  test('formatDateShort', () => expect(formatDateShort('2026-10-03')).toBe('03 Oct 2026'));
  test('empty/invalid input is safe', () => {
    expect(formatDateIN('')).toBe('');
    expect(formatDateIN(undefined)).toBe('');
  });
  test('toISODate uses LOCAL date parts', () =>
    expect(toISODate(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03'));
  test('financial year starts on 1 April', () => {
    expect(getFinancialYear('2026-03-31')).toBe(2025);
    expect(getFinancialYear('2026-04-01')).toBe(2026);
    expect(getFinancialYear('2026-12-31')).toBe(2026);
    expect(getFinancialYear('2027-01-01')).toBe(2026);
  });
});
describe('helpers', () => {
  test('toNum mirrors parseFloat(x) || 0', () => {
    expect(toNum('12.5')).toBe(12.5);
    expect(toNum('')).toBe(0);
    expect(toNum('abc')).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum('3abc')).toBe(3);
  });
  test('digitsOnly', () => expect(digitsOnly('+91 98765-43210')).toBe('919876543210'));
});
