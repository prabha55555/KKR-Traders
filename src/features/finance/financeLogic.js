import { differenceInMonths, differenceInDays } from 'date-fns';

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

  const totalInterestAccrued = computeInterest(
    principal,
    rate,
    record.startDate,
    targetDate || record.endDate,
  );

  const payments = record.payments || [];
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
  const isSettled = balancePayable <= 0 && (totalPaid > 0 || principal === 0);

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
