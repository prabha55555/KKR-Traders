/**
 * Shared body of the "Processing Lots" and "Completed Lots" pages: KPIs, search and the lots as rows (LotRow), plus
 * every form / action of a lot. Ongoing lots are split by stage — "At Dyeing" and "At Combing" — so each process
 * shows only its own details (several lots can be at the same unit at once; each row is one lot / DC).
 */
import { CheckCircle2, Factory, FilePlus2, Pencil, Scale, Truck, Wallet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatCurrency, toNum } from '@/core/format';
import { printHtml } from '@/platform';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  Button,
  ChoiceChips,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Page,
  RefreshButton,
  SearchBar,
  StatCard,
  cn,
  useFeedback,
} from '@/ui';
import { buildLotDcHtml } from './dcPrint';
import { DyedModal, IssueModal, ReceiveModal } from './LotForms';
import { LotPaymentHistoryModal, LotPaymentModal } from './LotPaymentModal';
import { AddReturnModal, ReturnHistoryModal } from './LotReturnModals';
import { LotRow } from './LotRow';
import { LOT_STATUS, filterLots, formatDcNo, lotTotals, sortLotsNewestFirst } from './lotLogic';
import { deleteLot, loadProcessingData, undoLastStage } from './processingService';

const rupees = (n) => `₹${formatCurrency(n)}`;
const kg = (n) => `${Math.round(toNum(n) * 1000) / 1000} kg`;

/** Edit: which DC of the lot to correct (only the ones already entered are offered). */
function EditChooser({ lot, onPick, onClose }) {
  if (!lot) return null;
  const options = [
    {
      kind: 'issue',
      title: 'My DC',
      text: `${formatDcNo(lot.dcNo)} · ${kg(lot.grey?.qty)} ${lot.grey?.description ?? ''}`,
    },
    lot.dyeing && {
      kind: 'dyed',
      title: "Dyeing unit's DC",
      text: `${formatDcNo(lot.dyeing.dcNo)} · ${kg(lot.dyeing.qty)} to ${lot.combingUnit?.name ?? 'combing'}`,
    },
    lot.received && {
      kind: 'received',
      title: "Combing unit's DC",
      text: `${formatDcNo(lot.received.dcNo)} · ${kg(lot.received.qty)} received`,
    },
  ].filter(Boolean);
  return (
    <Modal open onClose={onClose} size="sm" title={`Edit lot ${formatDcNo(lot.dcNo)}`}>
      <div className="space-y-2">
        {options.map((o) => (
          <button
            key={o.kind}
            type="button"
            onClick={() => onPick(o.kind)}
            className="flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 ring-line transition hover:bg-gold-50 hover:ring-gold-300"
          >
            <Pencil className="size-4 shrink-0 text-gold-600" aria-hidden />
            <span className="min-w-0">
              <span className="block font-semibold text-brand-800">{o.title}</span>
              <span className="block truncate text-xs text-slate-500">{o.text}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

const EMPTY = { lots: [], shortcuts: [], bankAccounts: [], stockMap: new Map(), dyers: [], combingUnits: [] };

/** `mode`: 'ongoing' (at dyeing / at combing) | 'completed' (received). */
export function LotsView({ mode }) {
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState(EMPTY);
  const [searchParams] = useSearchParams();
  // ?search= (links from the stock page) pre-fills the search
  const [query, setQuery] = useState(() => searchParams.get('search') ?? '');
  const [modal, setModal] = useState(null); // { kind: 'issue'|'dyed'|'received'|'pay', lot }
  const load = useCallback(async () => setData(await loadProcessingData()), []);
  const { loading, error, refreshing, refresh, reload } = useFocusLoad(load);

  // ongoing lots are looked at one stage at a time
  const [stageTab, setStageTab] = useState(() =>
    searchParams.get('stage') === 'combing' ? 'combing' : 'dyeing',
  );
  const stage = mode === 'completed' ? 'completed' : stageTab;
  const STAGE_STATUS = {
    dyeing: LOT_STATUS.AT_DYEING,
    combing: LOT_STATUS.AT_COMBING,
    completed: LOT_STATUS.RECEIVED,
  };
  const counts = useMemo(
    () => ({
      dyeing: data.lots.filter((l) => l.status === LOT_STATUS.AT_DYEING).length,
      combing: data.lots.filter((l) => l.status === LOT_STATUS.AT_COMBING).length,
    }),
    [data.lots],
  );
  const lots = useMemo(
    () =>
      sortLotsNewestFirst(
        filterLots(
          data.lots.filter((l) => l.status === STAGE_STATUS[stage]),
          query,
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.lots, stage, query],
  );

  const kpis = useMemo(() => {
    const all = data.lots.map((l) => ({ lot: l, t: lotTotals(l) }));
    const due = all.reduce((s, { t }) => s + Math.max(0, t.dyeingDue) + Math.max(0, t.combingDue), 0);
    if (mode === 'completed') {
      const done = all.filter(({ lot }) => lot.status === LOT_STATUS.RECEIVED);
      const grey = done.reduce((s, { t }) => s + t.greyQty, 0);
      const fin = done.reduce((s, { t }) => s + t.finalQty, 0);
      return [
        { label: 'Lots received', value: done.length, icon: CheckCircle2, tint: 'green' },
        { label: 'Finished kg received', value: kg(fin), icon: Factory, tint: 'brand' },
        {
          label: 'Average weight loss',
          value: grey > 0 ? `${Math.round(((grey - fin) / grey) * 10000) / 100}%` : '—',
          icon: Scale,
          tint: 'red',
        },
        { label: 'Due to units', value: rupees(due), icon: Wallet, tint: 'amber' },
      ];
    }
    const atDyeing = all.filter(({ lot }) => lot.status === LOT_STATUS.AT_DYEING);
    const atCombing = all.filter(({ lot }) => lot.status === LOT_STATUS.AT_COMBING);
    return [
      {
        label: 'At dyeing',
        value: `${atDyeing.length} · ${kg(atDyeing.reduce((s, { t }) => s + t.greyQty, 0))}`,
        icon: Factory,
        tint: 'sky',
      },
      {
        label: 'At combing',
        value: `${atCombing.length} · ${kg(atCombing.reduce((s, { t }) => s + t.dyedQty, 0))}`,
        icon: Truck,
        tint: 'violet',
      },
      { label: 'Due to units', value: rupees(due), icon: Wallet, tint: 'amber' },
    ];
  }, [data.lots, mode]);

  const replaceLot = (lot) =>
    setData((d) => {
      const exists = d.lots.some((l) => l.id === lot.id);
      return { ...d, lots: exists ? d.lots.map((l) => (l.id === lot.id ? lot : l)) : [...d.lots, lot] };
    });
  const close = () => setModal(null);
  const print = async (lot) => {
    try {
      await printHtml(buildLotDcHtml(lot));
    } catch {
      toast('Print failed', 'Could not open the print preview.', 'error');
    }
  };

  const onIssued = async (lot, { isNew }) => {
    replaceLot(lot);
    close();
    toast(
      isNew ? 'Lot created' : 'DC updated',
      `${formatDcNo(lot.dcNo)}: ${kg(lot.grey.qty)} ${lot.grey.description} to ${lot.dyer.name}`,
      'success',
    );
    if (isNew) await print(lot);
    void reload();
  };
  const onStage = (message) => (lot) => {
    replaceLot(lot);
    close();
    toast(message, `Lot ${formatDcNo(lot.dcNo)}`, 'success');
    if (mode === 'ongoing' && lot.status === LOT_STATUS.AT_COMBING) setStageTab('combing');
    void reload();
  };
  const undo = async (lot) => {
    const received = lot.status === LOT_STATUS.RECEIVED;
    const ok = await confirm({
      title: 'Undo last step',
      message: received
        ? `Undo the receipt of lot ${formatDcNo(lot.dcNo)}? ${kg(lot.received?.qty)} of ${lot.finishedDescription} is taken out of stock again.`
        : `Clear the dyeing unit's DC of lot ${formatDcNo(lot.dcNo)}? The lot goes back to "At Dyeing".`,
      tone: 'warning',
      confirmText: 'Undo',
    });
    if (!ok) return;
    try {
      replaceLot(await undoLastStage(lot));
      void reload();
    } catch (err) {
      toast('Cannot undo', err instanceof Error ? err.message : 'Could not undo the step.', 'error');
    }
  };
  const remove = async (lot) => {
    const paid = lotTotals(lot);
    const ok = await confirm({
      title: 'Delete lot',
      message: `Delete lot ${formatDcNo(lot.dcNo)}? ${kg(lot.grey?.qty)} of ${lot.grey?.description} goes back to stock${
        lot.status === LOT_STATUS.RECEIVED ? `, the ${kg(lot.received?.qty)} received leaves stock` : ''
      }${paid.dyeingPaid + paid.combingPaid > 0 ? ' and its payments are removed from Cash / bank' : ''}. This cannot be undone.`,
      tone: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteLot(lot);
      setData((d) => ({ ...d, lots: d.lots.filter((l) => l.id !== lot.id) }));
      toast('Lot deleted', `Lot ${formatDcNo(lot.dcNo)}`, 'success');
      void reload();
    } catch {
      toast('Error', 'Could not delete the lot.', 'error');
    }
  };

  const onAction = (action, lot) => {
    if (action === 'delete') void remove(lot);
    else if (action === 'undo') void undo(lot);
    else if (action === 'edit')
      setModal(lot.dyeing ? { kind: 'editChooser', lot } : { kind: 'issue', lot, edit: true });
    else setModal({ kind: action, lot });
  };
  // modals always show the latest copy of the lot (payments / returns change it while open)
  const current = modal?.lot ? (data.lots.find((l) => l.id === modal.lot.id) ?? modal.lot) : null;
  const afterChange = (lot) => {
    replaceLot(lot);
    void reload();
  };

  const title = mode === 'completed' ? 'Completed Lots' : 'Processing Lots';
  return (
    <Page
      title={title}
      icon={mode === 'completed' ? CheckCircle2 : Factory}
      actions={
        <>
          <RefreshButton onClick={refresh} loading={refreshing} />
          {mode === 'ongoing' ? (
            <Button icon={FilePlus2} onClick={() => setModal({ kind: 'issue', lot: null })}>
              <span className="max-sm:sr-only">New lot</span>
            </Button>
          ) : null}
        </>
      }
    >
      {loading ? (
        <LoadingState label="Loading lots…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <div className="space-y-4">
          <div
            className={cn(
              'grid gap-3',
              kpis.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3',
            )}
          >
            {kpis.map((k) => (
              <StatCard key={k.label} icon={k.icon} value={k.value} label={k.label} tint={k.tint} />
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {mode === 'ongoing' ? (
              <ChoiceChips
                value={stageTab}
                onChange={setStageTab}
                options={[
                  { value: 'dyeing', label: `At Dyeing (${counts.dyeing})` },
                  { value: 'combing', label: `At Combing (${counts.combing})` },
                ]}
              />
            ) : null}
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search DC no, product or unit…"
              className="flex-1"
            />
          </div>
          {lots.length === 0 ? (
            <EmptyState
              icon={mode === 'completed' ? CheckCircle2 : Factory}
              title={
                query
                  ? 'No lots match the search'
                  : stage === 'completed'
                    ? 'No lots received yet'
                    : stage === 'combing'
                      ? 'Nothing at the combing units'
                      : 'Nothing at the dyeing units'
              }
              message={
                stage === 'completed'
                  ? 'Lots appear here once the processed fabric is received back and added to stock.'
                  : stage === 'combing'
                    ? "A lot moves here when you enter the dyeing unit's DC (the dyed fabric went on to combing)."
                    : 'Create a lot when you send grey fabric to the dyeing unit: your DC is printed and grey stock goes down.'
              }
              action={
                stage === 'dyeing' && !query ? (
                  <Button icon={FilePlus2} onClick={() => setModal({ kind: 'issue', lot: null })}>
                    New lot
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="space-y-3">
              {lots.map((lot) => (
                <LotRow
                  key={lot.id}
                  lot={lot}
                  stage={stage}
                  onNext={(l) =>
                    setModal({ kind: l.status === LOT_STATUS.AT_DYEING ? 'dyed' : 'received', lot: l })
                  }
                  onPrint={print}
                  onAction={onAction}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <IssueModal
        open={modal?.kind === 'issue'}
        onClose={close}
        data={data}
        existing={modal?.kind === 'issue' ? modal.lot : null}
        onSaved={onIssued}
        confirm={confirm}
      />
      <DyedModal
        open={modal?.kind === 'dyed'}
        onClose={close}
        lot={modal?.kind === 'dyed' ? modal.lot : null}
        data={data}
        onSaved={onStage(modal?.edit ? 'Dyeing DC updated' : 'Sent to combing')}
      />
      <ReceiveModal
        open={modal?.kind === 'received'}
        onClose={close}
        lot={modal?.kind === 'received' ? modal.lot : null}
        data={data}
        onSaved={onStage(modal?.edit ? 'Combing DC updated' : 'Received — added to stock')}
      />
      {modal?.kind === 'editChooser' ? (
        <EditChooser
          lot={current}
          onClose={close}
          onPick={(kind) => setModal({ kind, lot: current, edit: true })}
        />
      ) : null}
      <LotPaymentModal
        open={modal?.kind === 'pay'}
        onClose={close}
        lot={modal?.kind === 'pay' ? current : null}
        bankAccounts={data.bankAccounts}
        onSaved={(lot) => {
          afterChange(lot);
          close();
        }}
        toast={toast}
      />
      <LotPaymentHistoryModal
        open={modal?.kind === 'payHistory'}
        onClose={close}
        lot={modal?.kind === 'payHistory' ? current : null}
        onChanged={afterChange}
        onAddPayment={() => setModal({ kind: 'pay', lot: current })}
        confirm={confirm}
        toast={toast}
      />
      <AddReturnModal
        open={modal?.kind === 'return'}
        onClose={close}
        lot={modal?.kind === 'return' ? current : null}
        shortcuts={data.shortcuts}
        stockMap={data.stockMap}
        onSaved={(lot) => {
          afterChange(lot);
          close();
        }}
        toast={toast}
      />
      <ReturnHistoryModal
        open={modal?.kind === 'returnHistory'}
        onClose={close}
        lot={modal?.kind === 'returnHistory' ? current : null}
        onChanged={afterChange}
        confirm={confirm}
        toast={toast}
      />
    </Page>
  );
}
