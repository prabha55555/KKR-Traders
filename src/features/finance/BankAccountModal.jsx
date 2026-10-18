import { Building2, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button, Modal, TextField, NumberField, SelectField, Grid } from '@/ui';

const FORM_ID = 'bank-account-form';

export default function BankAccountModal({ account, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    accountName: '',
    bankName: '',
    accountNumber: '',
    accountType: 'Current',
    openingBalance: '',
    notes: '',
  });

  useEffect(() => {
    if (account) {
      setForm({
        accountName: account.accountName || '',
        bankName: account.bankName || '',
        accountNumber: account.accountNumber || '',
        accountType: account.accountType || 'Current',
        openingBalance: account.openingBalance !== undefined ? String(account.openingBalance) : '',
        notes: account.notes || '',
      });
    } else {
      setForm({
        accountName: '',
        bankName: '',
        accountNumber: '',
        accountType: 'Current',
        openingBalance: '0',
        notes: '',
      });
    }
  }, [account]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.accountName.trim()) return;
    onSave({
      ...(account || {}),
      accountName: form.accountName.trim(),
      bankName: form.bankName.trim(),
      accountNumber: form.accountNumber.trim(),
      accountType: form.accountType,
      openingBalance: parseFloat(form.openingBalance) || 0,
      notes: form.notes.trim(),
    });
  };

  const editing = !!account?.id;

  return (
    <Modal
      open={true}
      onClose={saving ? undefined : onClose}
      title={editing ? 'Edit Bank Account' : 'Create Bank Account'}
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
            {saving ? 'Saving...' : 'Save Account'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <Grid>
          <TextField
            label="Account Display Name"
            placeholder="e.g. SBI Current A/c, HDFC Main"
            value={form.accountName}
            onChange={(accountName) => setForm((prev) => ({ ...prev, accountName }))}
            required
            autoFocus
          />
          <TextField
            label="Bank Name"
            placeholder="e.g. State Bank of India, HDFC"
            value={form.bankName}
            onChange={(bankName) => setForm((prev) => ({ ...prev, bankName }))}
          />
          <TextField
            label="Account Number (or last 4 digits)"
            placeholder="e.g. 9876 or full account number"
            value={form.accountNumber}
            onChange={(accountNumber) => setForm((prev) => ({ ...prev, accountNumber }))}
          />
          <SelectField
            label="Account Type"
            value={form.accountType}
            onChange={(accountType) => setForm((prev) => ({ ...prev, accountType }))}
            options={[
              { value: 'Current', label: 'Current Account' },
              { value: 'Savings', label: 'Savings Account' },
              { value: 'Overdraft', label: 'Overdraft (OD/CC) Account' },
            ]}
          />
          <NumberField
            label="Opening Balance (₹)"
            placeholder="0.00"
            value={form.openingBalance}
            onChange={(openingBalance) => setForm((prev) => ({ ...prev, openingBalance }))}
            allowNegative={form.accountType === 'Overdraft'}
            required
          />
          <TextField
            label="Notes / Branch (optional)"
            placeholder="e.g. Main Branch, used for vendor payments"
            value={form.notes}
            onChange={(notes) => setForm((prev) => ({ ...prev, notes }))}
          />
        </Grid>
      </form>
    </Modal>
  );
}
