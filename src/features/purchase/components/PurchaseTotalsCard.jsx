/**
 * The calculation block of purchase.html / edit-purchase.html: current subtotal, previous balance, opening balance,
 * discount, total due, payment methods, total paid and the balance still due. Rendered by the shared
 * BillTotalsPanel.
 *
 * Props
 *  - form: { previousBalance, manualPreviousBalance, discountAmount, cash, account, bankAccountId }
 *  - totals: { subtotal, grandTotal, totalPaid, balanceDue }   (may be negative: a credit with the supplier)
 *  - onChange(patch)            merged into the form
 *  - additionalPaid?: number    edit screen: payments added later from Purchase History (already inside totalPaid)
 */
import { BillTotalsPanel } from '@/components/bill/BillTotalsPanel';
import { formatCurrency } from '@/core/format';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function PurchaseTotalsCard({ form, totals, onChange, additionalPaid }) {
  return (
    <BillTotalsPanel
      title="Bill Summary"
      mode="purchase"
      balanceLabel="Balance Due"
      form={form}
      totals={totals}
      onChange={onChange}
      note={
        additionalPaid > 0
          ? `Includes ${rupees(additionalPaid)} paid later (added from Purchase History).`
          : undefined
      }
    />
  );
}
