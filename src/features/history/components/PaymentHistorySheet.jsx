/**
 * PaymentHistorySheet – viewPaymentHistory(): every payment record of one invoice with undo per payment
 * and "Undo All Payments".
 *
 * Props:
 *   open (bool) · invoiceNo · partyName · balanceDue (number) · payments (HistoryPayment[]) · onClose()
 *   title?              default `Payment History - Invoice #<no>`
 *   onUndo(paymentId)   undo one payment (the caller confirms)
 *   onUndoAll()         undo all payments (the caller confirms)
 *   onAddPayment?()     "Add Payment" footer button – only pass it when the invoice may take another payment
 */
import { Banknote, Landmark, Plus, Smartphone, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/core/db';
import { formatCurrency, formatDateIN } from '@/core/format';
import { Button, EmptyState } from '@/ui';
import { sumPaymentAmounts } from '../lib/lookups';
import { sortPaymentsByDate } from '../lib/payments';
import { HistorySheet } from './HistorySheet';

function PaymentMethodBadge({ payment, bankMap, defaultBank }) {
  const rawMethod = payment.paymentMethod?.toLowerCase() || 'cash';
  const bank = payment.bankAccountId ? bankMap.get(payment.bankAccountId) : null;
  const activeBank = bank || (rawMethod === 'account' ? defaultBank : null);

  if (rawMethod === 'account') {
    const accName = activeBank ? activeBank.accountName : 'Bank Account';
    const bankDesc = activeBank?.bankName || activeBank?.accountType || '';
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 ring-1 ring-blue-200">
        <Landmark className="size-3.5 text-blue-600" />
        <span>Account: {accName}</span>
        {bankDesc && <span className="font-medium text-blue-600/80">({bankDesc})</span>}
      </span>
    );
  }

  if (rawMethod === 'upi') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-800 ring-1 ring-purple-200">
        <Smartphone className="size-3.5 text-purple-600" />
        <span>UPI</span>
        {activeBank && <span className="font-medium text-purple-600/80">({activeBank.accountName})</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
      <Banknote className="size-3.5 text-emerald-600" />
      <span>Cash in Hand</span>
    </span>
  );
}

export function PaymentHistorySheet({
  open,
  invoiceNo,
  partyName,
  balanceDue,
  payments,
  title,
  onClose,
  onUndo,
  onUndoAll,
  onAddPayment,
}) {
  const [bankAccounts, setBankAccounts] = useState([]);

  useEffect(() => {
    db.getAllBankAccounts().then(setBankAccounts).catch(console.error);
  }, []);

  const bankMap = useMemo(() => {
    const map = new Map();
    for (const b of bankAccounts) {
      map.set(b.id, b);
    }
    return map;
  }, [bankAccounts]);

  const sorted = useMemo(() => sortPaymentsByDate(payments), [payments]);

  return (
    <HistorySheet
      open={open}
      onClose={onClose}
      title={title ?? `Payment History - Invoice #${invoiceNo}`}
      actions={
        <>
          {onAddPayment ? (
            <Button variant="success" icon={Plus} onClick={onAddPayment} className="flex-1 sm:flex-none">
              Add Payment
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mb-4 rounded-2xl border border-white/10 surface-ink p-4 text-white shadow-lift">
        <p className="truncate font-display text-lg font-bold">{partyName}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-brand-300">Total Payments: {payments.length}</p>
          <p className="text-sm text-brand-200">
            Current Balance Due:{' '}
            <span className="font-display font-extrabold text-gold-300 tabular-nums">
              ₹{formatCurrency(balanceDue)}
            </span>
          </p>
        </div>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No payment records found for this invoice."
          message="Payments added to this invoice will be listed here."
          className="py-10"
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((payment, index) => {
            const id = payment.id || `payment_${index}`;
            return (
              <li
                key={`${id}-${index}`}
                className="rounded-2xl border border-l-[3px] border-line border-l-emerald-400 bg-white p-3.5 text-sm text-slate-700 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-dashed border-slate-200 pb-2">
                  <span className="font-display font-bold text-brand-800">Payment #{index + 1}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {formatDateIN(payment.paymentDate)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <p>
                    <span className="font-semibold text-slate-500">Amount: </span>
                    <span className="font-display font-extrabold text-emerald-600 tabular-nums">
                      ₹{formatCurrency(payment.amount)}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-500">Method: </span>
                    <PaymentMethodBadge payment={payment} bankMap={bankMap} defaultBank={bankAccounts[0]} />
                  </div>
                  <p>
                    <span className="font-semibold text-slate-500">Type: </span>
                    {payment.paymentType === 'initial' ? 'Initial Payment' : 'Additional Payment'}
                  </p>
                  {payment.note ? (
                    <p>
                      <span className="font-semibold text-slate-500">Notes: </span>
                      {payment.note}
                    </p>
                  ) : null}
                  <p className="text-xs break-all text-slate-400">
                    <span className="font-semibold text-slate-500">Payment ID: </span>
                    {id}
                  </p>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button variant="outlineDanger" size="sm" icon={Undo2} onClick={() => onUndo(id)}>
                    Undo This Payment
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {payments.length > 0 ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right font-display text-lg font-extrabold text-emerald-700 tabular-nums">
          Total Amount Paid: ₹{formatCurrency(sumPaymentAmounts(payments))}
        </p>
      ) : null}
    </HistorySheet>
  );
}
