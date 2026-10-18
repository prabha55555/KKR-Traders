/** Small date helpers the history screens need on top of `@/lib/format` (never Intl / toLocale*). */
import { formatDateIN, toISODate } from '@/core/format';
const pad2 = (n) => String(n).padStart(2, '0');
/** `YYYY-MM-DD` day of a stored date string ('' when missing/invalid). Stored values may carry a time part. */
export function dayKey(value) {
  if (!value) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (m) return m[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : toISODate(parsed);
}
/** `new Date(value).getTime()` with invalid / missing dates treated as the epoch (the web sort did the same). */
export function dateMillis(value) {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}
/** HH:MM:SS in local time (Date#toTimeString().split(' ')[0] on the web). */
export function timeOfDay(now) {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}
/** 3/10/2026, 4:05:09 pm  (en-IN toLocaleString, which the statements print as "Generated on") */
export function formatDateTimeIN(now) {
  const h = now.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${formatDateIN(toISODate(now))}, ${h12}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())} ${h < 12 ? 'am' : 'pm'}`;
}
