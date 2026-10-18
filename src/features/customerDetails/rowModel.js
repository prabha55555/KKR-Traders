/** Display values of one customer row — shared by the phone cards and the desktop table so both always agree. */
import { formatRupees } from '@/core/format';
import { customerBalance } from './aggregate';
import { balanceTone } from './display';
import { canSendReminder } from './reminder';
export function buildRowModel(customer) {
  const hasReturns = customer.totalReturns > 0;
  const balance = customerBalance(customer);
  return {
    invoices: String(customer.totalInvoices),
    openingBalance: formatRupees(customer.firstInvoicePreviousBalance + customer.totalManualAdjustments),
    amount: formatRupees(customer.totalCurrentBillAmount),
    paid: formatRupees(customer.amountPaid),
    discount: formatRupees(customer.totalDiscountAmount),
    returns: hasReturns ? formatRupees(customer.totalReturns) : '₹0.00',
    balance: formatRupees(balance),
    hasReturns,
    canRemind: canSendReminder(customer),
    tones: {
      openingBalance: 'neutral',
      amount: 'positive',
      paid: 'positive',
      discount: 'negative',
      returns: hasReturns ? 'negative' : 'neutral',
      balance: balanceTone(balance),
    },
  };
}
