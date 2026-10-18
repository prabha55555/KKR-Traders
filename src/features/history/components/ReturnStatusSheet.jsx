/**
 * ReturnStatusSheet – viewReturnStatus(): every return record of one invoice with undo per return and
 * "Undo All Returns".
 *
 * Props: open (bool) · invoiceNo · partyName · returns (HistoryReturn[]) · onClose() ·
 *        onUndo(returnId) · onUndoAll() (callers confirm) · onAddReturn?() ("Add Return" footer button).
 */
import { Banknote, Landmark, Plus, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { accountLabel } from '@/core/accountLabel';
import { db } from '@/core/db';
import { isBalanceReturn } from '@/core/ledger';
import { formatCurrency, formatDateIN, invoiceNoLabel, toNum } from '@/core/format';
import { Badge, Button, EmptyState } from '@/ui';
import { dateMillis } from '../lib/dates';
import { sumReturnAmounts } from '../lib/lookups';
import { HistorySheet } from './HistorySheet';

/**
 * How a return was settled. A refund (settlementType 'refund' or any refundMethod — the same test as core/ledger
 * isBalanceReturn) is Cash only when its refundMethod is 'cash'; any other refund is an Account refund, exactly as
 * Finance books it (features/finance/accountsLogic), shown against its bank — or, without a stored bank, the first bank
 * account, where Finance books it. Older returns without settlement fields adjusted the bill's balance.
 */
function ReturnMethodBadge({ item, bankMap, defaultBank }) {
  if (!isBalanceReturn(item)) {
    if (String(item.refundMethod ?? '').toLowerCase() !== 'cash') {
      const bank = (item.bankAccountId ? bankMap.get(item.bankAccountId) : null) || defaultBank;
      return (
        <Badge tone="info">
          <Landmark className="mr-1 inline size-3.5 align-[-3px]" aria-hidden />
          Account Refund: {accountLabel(bank)}
        </Badge>
      );
    }
    return (
      <Badge tone="success">
        <Banknote className="mr-1 inline size-3.5 align-[-3px]" aria-hidden />
        Cash Refund
      </Badge>
    );
  }

  return (
    <Badge tone="warning">
      <RotateCcw className="mr-1 inline size-3.5 align-[-3px]" aria-hidden />
      Bill Balance Adjustment
    </Badge>
  );
}

export function ReturnStatusSheet({
  open,
  invoiceNo,
  partyName,
  returns,
  onClose,
  onUndo,
  onUndoAll,
  onAddReturn,
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

  const sorted = useMemo(
    () => [...returns].sort((a, b) => dateMillis(a.returnDate) - dateMillis(b.returnDate)),
    [returns],
  );

  return (
    <HistorySheet
      open={open}
      onClose={onClose}
      title={`Return Status - ${invoiceNoLabel(invoiceNo)}`}
      actions={
        <>
          {onAddReturn ? (
            <Button variant="warning" icon={Plus} onClick={onAddReturn} className="flex-1 sm:flex-none">
              Add Return
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mb-4 rounded-2xl border border-white/10 surface-ink p-4 text-white shadow-lift">
        <p className="truncate font-display text-lg font-bold" title={partyName}>
          {partyName}
        </p>
        <p className="text-sm text-brand-300">Total Returns: {returns.length}</p>
      </div>

      {returns.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="No return records found for this invoice."
          message="Returned items will be listed here."
          className="py-10"
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((item, index) => (
            <li
              key={`${item.id}-${index}`}
              className="rounded-2xl border border-l-[3px] border-line border-l-amber-400 bg-white p-3.5 text-sm text-slate-700 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-dashed border-slate-200 pb-2">
                <span className="font-display font-bold text-amber-800">Return #{index + 1}</span>
                <Badge tone="neutral" className="tabular-nums">
                  {formatDateIN(item.returnDate)}
                </Badge>
              </div>
              <div className="space-y-1.5">
                <p className="break-words">
                  <span className="font-semibold text-slate-500">Product: </span>
                  {item.description}
                </p>
                <p>
                  <span className="font-semibold text-slate-500">Quantity: </span>
                  {item.qty}
                </p>
                {toNum(item.rolls) > 0 ? (
                  <p>
                    <span className="font-semibold text-slate-500">Rolls: </span>
                    {toNum(item.rolls)}
                  </p>
                ) : null}
                <p>
                  <span className="font-semibold text-slate-500">Rate: </span>₹{formatCurrency(item.rate)}
                </p>
                <p>
                  <span className="font-semibold text-slate-500">Amount: </span>
                  <span className="font-display font-extrabold text-red-600 tabular-nums">
                    ₹{formatCurrency(item.returnAmount)}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-slate-500">Method: </span>
                  <ReturnMethodBadge item={item} bankMap={bankMap} defaultBank={bankAccounts[0]} />
                </div>
                <p>
                  <span className="font-semibold text-slate-500">Reason: </span>
                  {item.reason || 'N/A'}
                </p>
              </div>
              <div className="mt-2 flex justify-end">
                <Button variant="outlineWarning" size="sm" icon={Undo2} onClick={() => onUndo(item.id)}>
                  Undo This Return
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {returns.length > 0 ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-right font-display text-lg font-extrabold text-red-600 tabular-nums">
          Total Return Amount: ₹{formatCurrency(sumReturnAmounts(returns))}
        </p>
      ) : null}
    </HistorySheet>
  );
}
