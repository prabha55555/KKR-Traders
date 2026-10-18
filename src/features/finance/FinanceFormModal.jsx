import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { accountLabel, CASH_LABEL } from '@/core/accountLabel';
import { db } from '@/core/db';
import { PartyNotFoundHint, PartyPicker } from '@/components/bill';
import { differenceInMonths, differenceInDays } from 'date-fns';
import { Button, Grid, Modal, NumberField, DateField, TextArea, SelectField } from '@/ui';
import { loadLiveAccountBalances } from './accountsLogic';

const FORM_ID = 'finance-record-form';

export default function FinanceFormModal({ form, onChange, saving, onClose, onSave }) {
  const editing = !!form?.id;
  const [lenders, setLenders] = useState([]);
  const [liveBalances, setLiveBalances] = useState(null);

  useEffect(() => {
    if (form) {
      db.getAllLenders().then(setLenders).catch(console.error);
      loadLiveAccountBalances().then(setLiveBalances).catch(console.error);
    }
  }, [form !== null]);

  const handlePhoneChange = (v) => {
    onChange({ ...form, phone: v });
  };

  const handleSelect = (party) => {
    onChange({
      ...form,
      phone: party.phone,
      lenderName: party.name,
      address: party.address || '',
    });
  };

  const notFoundPhone =
    form?.phone?.length >= 10 && !lenders.some((l) => l.phone === form.phone) ? form.phone : null;
  const showHint = notFoundPhone !== null && notFoundPhone === form?.phone?.trim();

  let durationStr = '';
  if (form?.startDate && form?.endDate) {
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (end >= start) {
      const months = differenceInMonths(end, start);
      const startPlusMonths = new Date(start);
      startPlusMonths.setMonth(startPlusMonths.getMonth() + months);
      const extraDays = differenceInDays(end, startPlusMonths);
      const totalMonths = months + extraDays / 30;
      durationStr = ` (${totalMonths.toFixed(1)} months)`;
    }
  }

  return (
    <Modal
      open={form !== null}
      onClose={saving ? undefined : onClose}
      title={editing ? 'Edit Finance Record' : 'Add Finance Record'}
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
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      {form ? (
        <form
          id={FORM_ID}
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">Lender Details</h3>
            <PartyPicker
              partyLabel="Lender"
              parties={lenders}
              phone={form.phone || ''}
              name={form.lenderName || ''}
              address={form.address || ''}
              onPhoneChange={handlePhoneChange}
              onSelect={handleSelect}
              readOnly={false}
              notFound={showHint ? <PartyNotFoundHint partyLabel="Lender" to={`/finance/lenders`} /> : null}
            />
          </div>

          <hr className="border-line" />

          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">Loan Details</h3>
            <Grid cols={{ base: 1, sm: 2 }}>
              <NumberField
                label="Principal Amount (Rs.)"
                placeholder="0.00"
                value={form.principal}
                onChange={(v) => onChange({ ...form, principal: v })}
                required
              />
              <NumberField
                label="Interest Rate (% per month)"
                placeholder="e.g. 2"
                value={form.rate}
                onChange={(v) => onChange({ ...form, rate: v })}
                required
              />
              <DateField
                label="Interest Start Date"
                value={form.startDate}
                onChange={(v) => onChange({ ...form, startDate: v })}
                required
              />
              <DateField
                label={`End Date${durationStr}`}
                value={form.endDate}
                onChange={(v) => onChange({ ...form, endDate: v })}
              />
              <SelectField
                label="Receive Loan In"
                value={form.depositAccount || 'cash'}
                onChange={(v) => onChange({ ...form, depositAccount: v })}
                options={[
                  { value: 'cash', label: CASH_LABEL },
                  ...(liveBalances?.bankAccounts || []).map((a) => ({ value: a.id, label: accountLabel(a) })),
                ]}
              />
              <TextArea
                label="Notes"
                placeholder="Any additional terms or notes..."
                value={form.notes}
                onChange={(v) => onChange({ ...form, notes: v })}
                className="sm:col-span-2"
                rows={2}
              />
            </Grid>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
