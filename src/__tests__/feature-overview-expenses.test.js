import {
  buildExpense,
  computeExpenseTotals,
  emptyExpenseForm,
  EXPENSE_INVALID_MESSAGE,
  expenseToForm,
  filterExpenses,
  validateExpense,
} from '@/features/overview/expenses/expensesLogic';
const form = (over = {}) => ({ id: '', date: '2026-10-03', amount: '125.50', reason: ' Tea ', ...over });
const e = (id, date, amount, reason) => ({
  id,
  date,
  amount: amount,
  reason,
});
// newest first like db.getAllExpenses
const expenses = [
  e('1', '2026-10-03', 100, 'Tea'),
  e('2', '2026-10-03', 50.5, 'Tea powder'),
  e('3', '2026-10-01', 200, 'Rent'),
  e('4', '2026-09-30', 70, 'Fuel'),
  e('5', '2026-09-01', '30', 'Courier'),
];
describe('validateExpense', () => {
  test('valid form', () => expect(validateExpense(form())).toBeNull());
  test.each([
    ['no date', { date: '' }],
    ['empty amount', { amount: '' }],
    ['non-numeric amount', { amount: '.' }],
    ['zero amount', { amount: '0' }],
    ['negative amount', { amount: '-5' }],
    ['blank reason', { reason: '   ' }],
  ])('%s -> "Please fill all fields with valid data."', (_name, over) => {
    expect(validateExpense(form(over))).toBe('Please fill all fields with valid data.');
    expect(EXPENSE_INVALID_MESSAGE).toBe('Please fill all fields with valid data.');
  });
});
describe('buildExpense', () => {
  const now = new Date('2026-10-03T08:15:30.123Z');
  test('new expense: id = Date.now() as a string, trimmed reason, numeric amount, ISO updatedAt', () => {
    const doc = buildExpense(form(), now);
    expect(doc).toEqual({
      id: String(now.getTime()),
      date: '2026-10-03',
      amount: 125.5,
      reason: 'Tea',
      paymentSource: 'cash',
      updatedAt: '2026-10-03T08:15:30.123Z',
    });
    // exactly the fields (and order) the web page wrote
    expect(Object.keys(doc)).toEqual(['id', 'date', 'amount', 'reason', 'paymentSource', 'updatedAt']);
  });
  test('editing keeps the existing id', () => {
    expect(buildExpense(form({ id: '1717171717171' }), now).id).toBe('1717171717171');
  });
});
describe('form helpers', () => {
  test('empty form defaults to the given day; editing loads the stored values as text', () => {
    expect(emptyExpenseForm('2026-10-03')).toEqual({
      id: '',
      date: '2026-10-03',
      amount: '',
      reason: '',
      paymentSource: 'cash',
    });
    expect(expenseToForm(e('9', '2026-10-01', 12.5, 'Rent'))).toEqual({
      id: '9',
      date: '2026-10-01',
      amount: '12.5',
      reason: 'Rent',
      paymentSource: 'cash',
    });
  });
});
describe('filterExpenses', () => {
  const ids = (d, r) => filterExpenses(expenses, d, r).map((x) => x.id);
  test('no terms -> everything, order untouched', () => {
    expect(filterExpenses(expenses, '', '  ')).toBe(expenses);
  });
  test('date: substring of the stored date', () => {
    expect(ids('2026-10-03', '')).toEqual(['1', '2']);
    expect(ids('2026-10', '')).toEqual(['1', '2', '3']);
  });
  test('reason: case-insensitive substring, trimmed', () => {
    expect(ids('', ' TEA ')).toEqual(['1', '2']);
    expect(ids('', 'powder')).toEqual(['2']);
  });
  test('both must match', () => {
    expect(ids('2026-10-01', 'tea')).toEqual([]);
    expect(ids('2026-10-03', 'tea p')).toEqual(['2']);
  });
});
describe('computeExpenseTotals', () => {
  const TODAY = '2026-10-03';
  test('no date term: today / this month / overall', () => {
    expect(computeExpenseTotals(expenses, '', TODAY)).toEqual({
      dayLabel: "Today's Total:",
      monthLabel: "This Month's Total:",
      dayTotal: 150.5, // 100 + 50.5
      monthTotal: 350.5, // + 200 (1 Oct)
      total: 450.5, // + 70 + 30
    });
  });
  test('YYYY-MM-DD term: that day and its month', () => {
    expect(computeExpenseTotals(expenses, '2026-10-01', TODAY)).toMatchObject({
      dayLabel: 'Total for 2026-10-01:',
      monthLabel: 'Total for 2026-10:',
      dayTotal: 200,
      monthTotal: 350.5,
    });
  });
  test('YYYY-MM term: no single day, that month', () => {
    expect(computeExpenseTotals(expenses, '2026-09', TODAY)).toMatchObject({
      dayLabel: 'Day Total:',
      monthLabel: 'Total for 2026-09:',
      dayTotal: 0,
      monthTotal: 100, // 70 + 30 (amount stored as a string)
    });
  });
  test('an unrecognised term falls back to today / this month', () => {
    expect(computeExpenseTotals(expenses, '2026', TODAY)).toMatchObject({
      dayLabel: "Today's Total:",
      dayTotal: 150.5,
    });
  });
  test('totals are summed over the filtered list that is shown', () => {
    const shown = filterExpenses(expenses, '', 'tea');
    expect(computeExpenseTotals(shown, '', TODAY)).toMatchObject({
      dayTotal: 150.5,
      monthTotal: 150.5,
      total: 150.5,
    });
  });
  test('empty list: zero totals with the labels still derived from the term', () => {
    expect(computeExpenseTotals([], '2026-10-01', TODAY)).toEqual({
      dayLabel: 'Total for 2026-10-01:',
      monthLabel: 'Total for 2026-10:',
      dayTotal: 0,
      monthTotal: 0,
      total: 0,
    });
  });
  test('uses the day passed in (device-local), not the UTC date', () => {
    expect(computeExpenseTotals(expenses, '', '2026-10-01').dayTotal).toBe(200);
  });
});
