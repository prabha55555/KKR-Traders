import { ArrowRightLeft, Save } from 'lucide-react';
import { useState } from 'react';
import { todayISO } from '@/core/format';
import { Button, Modal, NumberField, DateField, SelectField, TextField, Grid } from '@/ui';

const FORM_ID = 'transfer-form';

export default function FundTransferModal({ accounts, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    date: todayISO(),
    fromAccount: 'cash',
    toAccount: accounts[0]?.id || '',
    amount: '',
    notes: '',
  });

  const accountOptions = [
    { value: 'cash', label: 'Cash in Hand' },
    ...accounts.map((a) => ({
      value: a.id,
      label: `${a.accountName} (${a.bankName || a.accountType})`,
    })),
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return;
    if (form.fromAccount === form.toAccount) return;

    onSave({
      date: form.date,
      fromAccount: form.fromAccount,
      toAccount: form.toAccount,
      amount: amt,
      notes: form.notes.trim(),
      type:
        form.fromAccount === 'cash'
          ? 'Deposit to Bank'
          : form.toAccount === 'cash'
            ? 'Cash Withdrawal'
            : 'Bank Transfer',
    });
  };

  return (
    <Modal
      open={true}
      onClose={saving ? undefined : onClose}
      title="Transfer Funds / Cash Movement"
      size="md"
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
            {saving ? 'Transferring...' : 'Record Transfer'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <Grid>
          <DateField
            label="Transfer Date"
            value={form.date}
            onChange={(date) => setForm((prev) => ({ ...prev, date }))}
            required
          />
          <NumberField
            label="Transfer Amount (₹)"
            placeholder="0.00"
            value={form.amount}
            onChange={(amount) => setForm((prev) => ({ ...prev, amount }))}
            required
            autoFocus
          />
          <SelectField
            label="From (Source Account)"
            value={form.fromAccount}
            onChange={(fromAccount) => setForm((prev) => ({ ...prev, fromAccount }))}
            options={accountOptions}
            required
          />
          <SelectField
            label="To (Destination Account)"
            value={form.toAccount}
            onChange={(toAccount) => setForm((prev) => ({ ...prev, toAccount }))}
            options={accountOptions.filter((opt) => opt.value !== form.fromAccount)}
            required
          />
          <TextField
            label="Remarks / Reference (optional)"
            placeholder="e.g. ATM withdrawal, counter deposit, UPI transfer"
            value={form.notes}
            onChange={(notes) => setForm((prev) => ({ ...prev, notes }))}
            className="sm:col-span-2"
          />
        </Grid>
      </form>
    </Modal>
  );
}
