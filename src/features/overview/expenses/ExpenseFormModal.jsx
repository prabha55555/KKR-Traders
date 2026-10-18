import { AlertTriangle, Banknote, Building2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CASH_LABEL, accountLabel } from '@/core/accountLabel';
import { formatCurrency } from '@/core/format';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import { Button, DateField, Modal, NumberField, SelectField, TextArea } from '@/ui';

const FORM_ID = 'expense-form';

/**
 * Add / edit sheet of the Expenses page with Payment Method (Cash in Hand or specific Bank Account).
 */
export default function ExpenseFormModal({ form, onChange, saving, onClose, onSave }) {
  const editing = !!form?.id;
  const [liveBalances, setLiveBalances] = useState(null);

  const isOpen = form !== null;

  useEffect(() => {
    if (isOpen) {
      loadLiveAccountBalances()
        .then(setLiveBalances)
        .catch((err) => console.error('Failed to load balances in expense form:', err));
    }
  }, [isOpen]);

  const bankAccounts = liveBalances?.bankAccounts || [];
  const cashBalance = liveBalances?.cashBalance ?? 0;
  const paymentSource = form?.paymentSource || 'cash';
  const amount = parseFloat(form?.amount) || 0;

  const isCash = paymentSource === 'cash';
  const selectedBank = bankAccounts.find((b) => b.id === paymentSource);
  const availableBalance = isCash ? cashBalance : (selectedBank?.currentBalance ?? 0);
  const isOverdrawn = liveBalances !== null && amount > 0 && amount > availableBalance;

  const paymentOptions = [
    // names only: the balance of the chosen source is shown in the row under the select
    { value: 'cash', label: CASH_LABEL },
    ...bankAccounts.map((a) => ({ value: a.id, label: accountLabel(a) })),
  ];

  return (
    <Modal
      open={isOpen}
      onClose={saving ? undefined : onClose}
      title={editing ? 'Edit Expense' : 'Add Expense'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            icon={Save}
            loading={saving}
            className="max-sm:flex-1"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      {form ? (
        <form
          id={FORM_ID}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="Date" value={form.date} onChange={(date) => onChange({ ...form, date })} />
            <NumberField
              label="Amount (Rs.)"
              value={form.amount}
              onChange={(amount) => onChange({ ...form, amount })}
            />
          </div>

          <div className="space-y-1.5">
            <SelectField
              label="Payment Method / Deduct From"
              value={paymentSource}
              onChange={(val) => onChange({ ...form, paymentSource: val })}
              options={paymentOptions}
            />

            {liveBalances && (
              <div
                className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs transition ${
                  isOverdrawn
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-emerald-200/80 bg-emerald-50/70 text-emerald-900'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                  {isCash ? (
                    <Banknote className="size-3.5 text-emerald-700" />
                  ) : (
                    <Building2 className="size-3.5 text-brand-700" />
                  )}
                  {isCash ? 'Available in Cash Drawer:' : `Available in ${accountLabel(selectedBank)}:`}
                </span>
                <span className="font-display text-[12px] font-extrabold tabular-nums">
                  ₹{formatCurrency(availableBalance)}
                </span>
              </div>
            )}

            {isOverdrawn && (
              <div className="flex items-center gap-1.5 px-1 pt-0.5 text-[11px] font-semibold text-amber-700">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>
                  Expense of ₹{formatCurrency(amount)} exceeds available balance (₹
                  {formatCurrency(availableBalance)}).
                </span>
              </div>
            )}
          </div>

          <TextArea
            label="Reason / Purpose"
            value={form.reason}
            onChange={(reason) => onChange({ ...form, reason })}
            placeholder="e.g. Factory Electricity, Tea/Snacks, Vehicle Diesel, Office Rent..."
            rows={3}
          />
        </form>
      ) : null}
    </Modal>
  );
}
