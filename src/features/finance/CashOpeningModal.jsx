import { Banknote, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button, Modal, NumberField } from '@/ui';

const FORM_ID = 'cash-opening-form';

export default function CashOpeningModal({ currentOpening, onClose, onSave, saving }) {
  const [openingBalance, setOpeningBalance] = useState('0');

  useEffect(() => {
    setOpeningBalance(String(currentOpening || 0));
  }, [currentOpening]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(parseFloat(openingBalance) || 0);
  };

  return (
    <Modal
      open={true}
      onClose={saving ? undefined : onClose}
      title="Set Cash in Hand Opening Balance"
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
            {saving ? 'Saving...' : 'Update Opening Cash'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Enter the initial physical cash amount available in your shop / cash drawer before recording any new
          sales or purchases.
        </p>
        <NumberField
          label="Initial Cash in Hand (₹)"
          placeholder="0.00"
          value={openingBalance}
          onChange={setOpeningBalance}
          required
          autoFocus
        />
      </form>
    </Modal>
  );
}
