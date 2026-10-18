/**
 * The calculation block of sales.html: subtotal, previous balance, opening balance, discount, total due,
 * payment methods, total paid and the new balance due. Rendered by the shared BillTotalsPanel.
 *
 * Props
 *  - form: the sales form (previousBalance, manualPreviousBalance, discountAmount, cash, account, bankAccountId,
 *          additionalPaymentsTotal)
 *  - totals: result of salesFormTotals(form)  { subtotal, grandTotal, totalPaid, balanceDue }
 *  - onChange(patch)            merged into the form
 */
import { BillTotalsPanel } from '@/components/bill/BillTotalsPanel';
import { formatCurrency } from '@/core/format';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function CalculationSection({ form, totals, onChange }) {
  return (
    <BillTotalsPanel
      title="Calculation"
      mode="sales"
      balanceLabel="New Balance Due"
      form={form}
      totals={totals}
      onChange={onChange}
      note={
        form.additionalPaymentsTotal > 0
          ? `Includes ${rupees(form.additionalPaymentsTotal)} of payments added later from Sales History.`
          : undefined
      }
    />
  );
}
