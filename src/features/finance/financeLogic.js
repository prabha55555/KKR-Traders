import { differenceInMonths, differenceInDays } from 'date-fns';

import { toNum } from '@/core/format';

/** Half a paisa: a smaller balance is paid off ("Pay Full Due" rounds the amount to the paisa). */
const PAID_OFF_TOLERANCE = 0.005;

export function computeInterest(principal, rate, startDate, endDate) {
  const p = parseFloat(principal);
  const r = parseFloat(rate);
  if (isNaN(p) || isNaN(r) || !startDate) return 0;

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();

  if (start > end) return 0;

  const months = differenceInMonths(end, start);
  const startPlusMonths = new Date(start);
  startPlusMonths.setMonth(startPlusMonths.getMonth() + months);

  const daysInMonth = 30;
  const extraDays = differenceInDays(end, startPlusMonths);

  const totalMonths = months + extraDays / daysInMonth;

  return (p * r * totalMonths) / 100;
}

export function emptyFinanceForm(dateStr) {
  return {
    lenderName: '',
    phone: '',
    address: '',
    principal: '',
    rate: '',
    startDate: dateStr,
    endDate: '', // blank by default (means ongoing)
    notes: '',
    payments: [],
  };
}

export function calculateFinanceStats(record, targetDate) {
  const principal = parseFloat(record.principal) || 0;
  const rate = parseFloat(record.rate) || 0;

  // no interest after the end date (set when a payment paid the loan off), also "as of" a later day
  const interestUntil =
    targetDate && record.endDate && new Date(targetDate) > new Date(record.endDate)
      ? record.endDate
      : targetDate || record.endDate;
  const totalInterestAccrued = computeInterest(principal, rate, record.startDate, interestUntil);

  // "as of" a day: only the payments made on or before it count (a later payment had not happened yet)
  const asOf = targetDate ? String(targetDate).slice(0, 10) : '';
  const payments = (record.payments || []).filter(
    (p) => !asOf || !p.date || String(p.date).slice(0, 10) <= asOf,
  );
  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  const totalPayable = principal + totalInterestAccrued;
  const balancePayable = Math.max(0, totalPayable - totalPaid);

  const expectedMonthlyInterest = (principal * rate) / 100;

  const calculationDate = targetDate ? new Date(targetDate) : new Date();
  const start = new Date(record.startDate);

  let monthsElapsed = differenceInMonths(calculationDate, start);
  if (monthsElapsed < 0) monthsElapsed = 0;

  let totalMonths = monthsElapsed;
  if (record.endDate) {
    totalMonths = differenceInMonths(new Date(record.endDate), start);
    if (totalMonths < 0) totalMonths = 0;
  }

  const totalStrictlyDue = monthsElapsed * expectedMonthlyInterest;
  const overdueAmount = totalStrictlyDue - totalPaid;
  const isOverdue = balancePayable > 0 && overdueAmount > 0;
  const isSettled = balancePayable < PAID_OFF_TOLERANCE && (totalPaid > 0 || principal === 0);

  return {
    totalInterestAccrued,
    totalPaid,
    totalPayable,
    balancePayable,
    expectedMonthlyInterest,
    isOverdue,
    overdueAmount: isOverdue ? overdueAmount : 0,
    monthsElapsed,
    totalMonths,
    isSettled,
  };
}

/**
 * The loan after a repayment. When the payments pay a loan without an end date off (interest counted up to the latest
 * payment date), that date becomes its end date: interest stops there, so the loan stays settled instead of turning
 * "ongoing" again the next day as interest kept accruing to today. `paidOffOn` remembers the date was set this way.
 */
export function addLoanPayment(record, payment) {
  const payments = [...(record.payments || []), payment];
  const updated = { ...record, payments };
  if (record.endDate) return updated;
  const lastDate = payments
    .map((p) => p.date)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!lastDate) return updated;
  const { balancePayable } = calculateFinanceStats({ ...updated, endDate: lastDate });
  if (balancePayable >= PAID_OFF_TOLERANCE) return updated;
  return { ...updated, endDate: lastDate, paidOffOn: lastDate };
}

/**
 * Position of `payment` in the loan's payments: by id, else the very same object, else (older payments have no id) the
 * `hint` position when it still holds a payment of that date and amount, else the first such payment. -1 if none.
 */
export function findLoanPaymentIndex(record, payment, hint) {
  const payments = record?.payments || [];
  if (!payment) return -1;
  if (payment.id) return payments.findIndex((p) => p?.id === payment.id);
  const same = payments.indexOf(payment);
  if (same >= 0) return same;
  const matches = (p) => !!p && !p.id && p.date === payment.date && toNum(p.amount) === toNum(payment.amount);
  if (Number.isInteger(hint) && matches(payments[hint])) return hint;
  return payments.findIndex(matches);
}

/**
 * The loan without the payment at `index` (only that one, even when older payments share a missing id), or null when
 * there is no payment there. An end date that addLoanPayment set is cleared again when the loan is no longer paid off;
 * one the user typed (or changed) stays.
 */
export function removeLoanPayment(record, index) {
  const payments = record?.payments || [];
  if (!Number.isInteger(index) || index < 0 || index >= payments.length) return null;
  const updated = { ...record, payments: payments.filter((_, i) => i !== index) };
  if (record.paidOffOn && record.endDate === record.paidOffOn) {
    if (calculateFinanceStats(updated).balancePayable >= PAID_OFF_TOLERANCE) {
      const { paidOffOn: _cleared, ...rest } = updated;
      return { ...rest, endDate: '' };
    }
  }
  return updated;
}

export function validateFinanceForm(form) {
  if (!form.lenderName?.trim()) return 'Lender name is required.';

  const phone = form.phone?.trim() || '';
  let phoneDigits = phone.replace(/[^0-9]/g, '');
  if (phoneDigits.length !== 10) return 'Phone number must be exactly 10 digits.';

  if (!form.principal || parseFloat(form.principal) <= 0) return 'Valid principal amount is required.';
  if (!form.rate || parseFloat(form.rate) <= 0) return 'Valid interest rate is required.';
  if (!form.startDate) return 'Interest start date is required.';
  return null;
}

export async function updateLenderWithReferences(db, original, input) {
  const phoneChanged = input.phone !== original.phone;
  if (phoneChanged && (await db.getLender(input.phone))) {
    return 'duplicate';
  }

  // Update finance records linked to this lender
  const allFinance = await db.getAllFinanceRecords();
  const recordsToUpdate = allFinance.filter((r) => r.phone === original.phone);

  for (const r of recordsToUpdate) {
    await db.saveFinanceRecord({ ...r, phone: input.phone, lenderName: input.name });
  }

  await db.saveLender(input);

  if (phoneChanged) {
    try {
      await db.deleteLender(original.phone);
    } catch (error) {
      console.error('Failed to delete old lender record:', error);
    }
  }

  return 'updated';
}
