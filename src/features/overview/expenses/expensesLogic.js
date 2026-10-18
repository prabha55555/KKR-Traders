/** Other Expenses (port of js/expenses.js): validation, saved shape, search and the day / month / overall totals. */
import { toNum } from '@/core/format';
export const EXPENSE_INVALID_MESSAGE = 'Please fill all fields with valid data.';
export function emptyExpenseForm(today) {
  return { id: '', date: today, amount: '', reason: '', paymentSource: 'cash' };
}
export function expenseToForm(expense) {
  return {
    id: expense.id,
    date: expense.date,
    amount: String(expense.amount),
    reason: expense.reason,
    paymentSource: expense.paymentSource || 'cash',
  };
}
/** Date, a positive number and a non-blank reason are required. Returns the message to show, or null when valid. */
export function validateExpense(form) {
  const amount = parseFloat(form.amount);
  if (!form.date || Number.isNaN(amount) || amount <= 0 || !form.reason.trim())
    return EXPENSE_INVALID_MESSAGE;
  return null;
}
/** Document written to Firestore — field names and order exactly as the web page. `now` supplies id and updatedAt. */
export function buildExpense(form, now = new Date()) {
  return {
    id: form.id || now.getTime().toString(),
    date: form.date,
    amount: parseFloat(form.amount),
    reason: form.reason.trim(),
    paymentSource: form.paymentSource || 'cash',
    updatedAt: now.toISOString(),
  };
}
/** Date term is a substring of the stored date, reason term a case-insensitive substring of the reason. */
export function filterExpenses(expenses, dateTerm, reasonTerm) {
  const date = dateTerm.toLowerCase().trim();
  const reason = reasonTerm.toLowerCase().trim();
  if (!date && !reason) return expenses;
  return expenses.filter(
    (e) =>
      (!date || (!!e.date && e.date.includes(date))) &&
      (!reason || (!!e.reason && e.reason.toLowerCase().includes(reason))),
  );
}
/**
 * The totals strip under the list. Which day / month the "day" and "month" totals refer to depends on the date search
 * term: none (or unrecognised) -> today / this month; `YYYY-MM-DD` -> that day / its month; `YYYY-MM` -> no single
 * day, that month. The totals are summed over the (already filtered) list that is shown, as on the web page.
 *
 * PARITY NOTE: the web page took "today" from `toISOString()`, i.e. the UTC date, so between midnight and 05:30 IST
 * "Today's Total" still showed yesterday; `today` here is the device-local date (pass `todayISO()`).
 */
export function computeExpenseTotals(shown, dateTerm, today) {
  const term = dateTerm.trim();
  let targetDay = today;
  let targetMonth = today.substring(0, 7);
  let dayLabel = "Today's Total:";
  let monthLabel = "This Month's Total:";
  if (term) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(term)) {
      targetDay = term;
      targetMonth = term.substring(0, 7);
      dayLabel = `Total for ${term}:`;
      monthLabel = `Total for ${targetMonth}:`;
    } else if (/^\d{4}-\d{2}$/.test(term)) {
      targetDay = null;
      targetMonth = term;
      dayLabel = 'Day Total:';
      monthLabel = `Total for ${targetMonth}:`;
    }
  }
  let total = 0;
  let dayTotal = 0;
  let monthTotal = 0;
  shown.forEach((e) => {
    const amount = toNum(e.amount);
    total += amount;
    if (targetDay && e.date === targetDay) dayTotal += amount;
    if (targetMonth && e.date && e.date.startsWith(targetMonth)) monthTotal += amount;
  });
  return { dayLabel, monthLabel, dayTotal, monthTotal, total };
}
