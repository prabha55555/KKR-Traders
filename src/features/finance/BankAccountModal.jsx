import { Save } from 'lucide-react';
import { useState, useEffect } from 'react';

import { accountLabel } from '@/core/accountLabel';
import { Button, Modal, TextField, NumberField, Grid } from '@/ui';

const FORM_ID = 'bank-account-form';

/**
 * Create / edit a bank account: just a Bank Name and an Opening Balance. The name is stored in BOTH `accountName`
 * and `bankName` (many readers show `accountName`). Editing keeps every other field of an older account
 * (account number, type, notes) and only rewrites the name pair when the user actually renames it.
 */
export default function BankAccountModal({ account, onClose, onSave, saving }) {
  const initialName = account ? accountLabel(account) : '';
  const [form, setForm] = useState({ bankName: '', openingBalance: '0' });
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      bankName: account ? accountLabel(account) : '',
      openingBalance: account && account.openingBalance !== undefined ? String(account.openingBalance) : '0',
    });
    setError('');
  }, [account]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = form.bankName.trim();
    if (!name) {
      setError('Enter the bank name');
      return;
    }
    const openingBalance = parseFloat(form.openingBalance) || 0;
    if (account) {
      // the page passes the account with its computed balance figures: never store those
      const { currentBalance, inflows, outflows, ...stored } = account;
      onSave({
        ...stored,
        openingBalance,
        ...(name !== initialName ? { accountName: name, bankName: name } : {}),
      });
    } else {
      onSave({ accountName: name, bankName: name, openingBalance });
    }
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
          <Button variant="neutral" onClick={onClose} disabled={saving} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="success"
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
        <Grid cols={{ base: 1, sm: 2 }}>
          <TextField
            label="Bank Name"
            placeholder="e.g. SBI, HDFC"
            value={form.bankName}
            onChange={(bankName) => {
              setForm((prev) => ({ ...prev, bankName }));
              setError('');
            }}
            error={error}
            required
            autoFocus
          />
          <NumberField
            label="Opening Balance (₹)"
            placeholder="0.00"
            value={form.openingBalance}
            onChange={(openingBalance) => setForm((prev) => ({ ...prev, openingBalance }))}
            hint="Use a minus sign for an overdraft (OD/CC) account."
            allowNegative
            required
          />
        </Grid>
      </form>
    </Modal>
  );
}
