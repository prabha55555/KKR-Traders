/**
 * Pure formatting / parsing helpers (ports of the formatting parts of the web app's `Utils`).
 * Deliberately independent of `Intl` so output is identical in every browser and in tests.
 */
/** parseFloat(x) || 0 — the web app's universal numeric-input coercion. */
export function toNum(value) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}
/** Round to 2 decimals the way Intl.NumberFormat does (half away from zero on the decimal value: 1.005 -> 1.01). */
function round2(abs) {
  const s = String(abs);
  if (s.includes('e')) return Number(abs.toFixed(2));
  return Number(Math.round(Number(`${s}e2`)) + 'e-2');
}
/** Indian digit grouping: 12,34,567.89 */
export function formatCurrency(amount) {
  const parsed = parseFloat(String(amount ?? ''));
  const n = Number.isFinite(parsed) ? parsed : 0;
  const negative = n < 0;
  const fixed = round2(Math.abs(n)).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  let grouped;
  if (intPart.length <= 3) {
    grouped = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${last3}`;
  }
  const isZero = Number(fixed) === 0;
  return `${negative && !isZero ? '-' : ''}${grouped}.${decPart}`;
}
/** 1.5 Cr / 50 L / 5 K — empty for amounts under 1,000 */
export function formatAmountToText(amount) {
  if (!amount || Number.isNaN(amount)) return '';
  const abs = Math.abs(amount);
  let formatted;
  if (abs >= 10000000) formatted = `${(abs / 10000000).toFixed(2)} Cr`;
  else if (abs >= 100000) formatted = `${(abs / 100000).toFixed(2)} L`;
  else if (abs >= 1000) formatted = `${(abs / 1000).toFixed(2)} K`;
  else return '';
  formatted = formatted.replace('.00', '');
  return (amount < 0 ? '-' : '') + formatted;
}
const SINGLE = [
  '',
  'One ',
  'Two ',
  'Three ',
  'Four ',
  'Five ',
  'Six ',
  'Seven ',
  'Eight ',
  'Nine ',
  'Ten ',
  'Eleven ',
  'Twelve ',
  'Thirteen ',
  'Fourteen ',
  'Fifteen ',
  'Sixteen ',
  'Seventeen ',
  'Eighteen ',
  'Nineteen ',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function hundredsToWords(n) {
  let str = '';
  if (n > 99) {
    str += `${SINGLE[Math.floor(n / 100)]}Hundred `;
    n %= 100;
  }
  if (n > 19) {
    str += `${TENS[Math.floor(n / 10)]} `;
    n %= 10;
  }
  if (n > 0) str += SINGLE[n];
  return str;
}
/** "Rupees One Thousand Two Hundred Only" (Indian numbering) */
export function numberToWords(number) {
  let num = Math.round(number);
  if (num === 0) return 'Zero';
  if (Number.isNaN(num)) return '';
  // The web app printed "Rupees  Only" for negative totals (credit balance); say "Minus" instead.
  const negative = num < 0;
  num = Math.abs(num);
  let result = negative ? 'Minus ' : '';
  if (num >= 10000000) {
    result += `${hundredsToWords(Math.floor(num / 10000000))}Crore `;
    num %= 10000000;
  }
  if (num >= 100000) {
    result += `${hundredsToWords(Math.floor(num / 100000))}Lakh `;
    num %= 100000;
  }
  if (num >= 1000) {
    result += `${hundredsToWords(Math.floor(num / 1000))}Thousand `;
    num %= 1000;
  }
  if (num > 0) result += hundredsToWords(num);
  return `Rupees ${result.trim()} Only`;
}
// ------------------------------------------------------------------ dates
const pad2 = (n) => String(n).padStart(2, '0');
/** Local-date YYYY-MM-DD (what <input type="date"> held in the web app). */
export function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
export function todayISO() {
  return toISODate(new Date());
}
/** Parse a stored date string into a Date at local noon (immune to timezone day-shifts). */
export function parseISODate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** en-IN short date as the web app printed it: 3/10/2026 (day/month unpadded). */
export function formatDateIN(value) {
  const d = parseISODate(value);
  if (!d) return value ? String(value) : '';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 03 Oct 2026 */
export function formatDateShort(value) {
  const d = parseISODate(value);
  if (!d) return value ? String(value) : '';
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** Financial year starts 1 April: Jan–Mar belong to the previous calendar year's FY. */
export function getFinancialYear(dateInput) {
  let date = dateInput instanceof Date ? dateInput : parseISODate(dateInput ?? undefined);
  if (!date || Number.isNaN(date.getTime())) date = new Date();
  return date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
}
/** Digits only (for wa.me links and phone validation). */
export function digitsOnly(value) {
  return (value || '').replace(/[^0-9]/g, '');
}
/** ₹1,23,456.00 */
export function formatRupees(amount) {
  return `₹${formatCurrency(amount)}`;
}
