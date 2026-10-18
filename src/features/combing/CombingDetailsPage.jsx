import {
  AlertCircle,
  Banknote,
  Building2,
  CheckCircle2,
  ExternalLink,
  Layers,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { db } from '@/core/db';
import { digitsOnly, formatCurrency } from '@/core/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Page,
  RefreshButton,
  SearchBar,
  StatCard,
  TextField,
  useFeedback,
} from '@/ui';
import {
  calcProcessorBalanceSummary,
  emptyProcessor,
  filterProcessors,
  validateProcessor,
} from './combingLogic';
import { deleteProcessorRecord, getAllProcessorsList, saveProcessorRecord } from './combingService';

export default function CombingDetailsPage() {
  const { toast, confirm } = useFeedback();

  const [processors, setProcessors] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcessor, setEditingProcessor] = useState(null);
  const [form, setForm] = useState(emptyProcessor());
  const [saving, setSaving] = useState(false);

  const loadProcessors = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [list, batchList] = await Promise.all([
        getAllProcessorsList(),
        db.getAllCombingBatches ? db.getAllCombingBatches() : Promise.resolve([]),
      ]);
      setProcessors(list || []);
      setBatches(batchList || []);
    } catch (err) {
      console.error('Failed to load processors directory:', err);
      setError(err.message || 'Could not load processors.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProcessors();
  }, [loadProcessors]);

  const filteredProcessors = useMemo(() => {
    return filterProcessors(processors, searchTerm);
  }, [processors, searchTerm]);

  const overallSummary = useMemo(() => {
    return calcProcessorBalanceSummary(batches);
  }, [batches]);

  const handleOpenAdd = () => {
    setEditingProcessor(null);
    setForm(emptyProcessor());
    setIsModalOpen(true);
  };

  const handleOpenEdit = (proc) => {
    setEditingProcessor(proc);
    setForm({
      id: proc.id,
      processorName: proc.processorName || proc.name || '',
      ownerName: proc.ownerName || '',
      phone: proc.phone || '',
      address: proc.address || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (saving) return;

    const validation = validateProcessor(form);
    if (validation) {
      toast(validation.title, validation.message, 'error');
      return;
    }

    try {
      setSaving(true);
      await saveProcessorRecord(form);
      toast(
        editingProcessor ? 'Combing Unit Updated' : 'Combing Unit Added',
        `${form.processorName} has been saved to your directory.`,
        'success',
      );
      setIsModalOpen(false);
      loadProcessors(true);
    } catch (err) {
      toast('Save Failed', err.message || 'Could not save combing unit details.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (proc) => {
    const name = proc.processorName || proc.name;
    const ok = await confirm({
      title: `Delete ${name}?`,
      message: `Are you sure you want to remove "${name}" (${proc.ownerName}) from your combing directory?`,
      tone: 'danger',
      confirmText: 'Delete Unit',
    });
    if (!ok) return;

    try {
      await deleteProcessorRecord(proc.id || proc.phone);
      toast('Combing Unit Removed', `${name} was removed.`, 'success');
      loadProcessors(true);
    } catch (err) {
      toast('Delete Failed', err.message || 'Could not delete unit.', 'error');
    }
  };

  if (loading && processors.length === 0) {
    return (
      <Page title="Combing Units" icon={Users}>
        <LoadingState label="Loading combing units directory…" />
      </Page>
    );
  }

  if (error && processors.length === 0) {
    return (
      <Page title="Combing Units" icon={Users}>
        <ErrorState message={error} onRetry={() => loadProcessors(false)} />
      </Page>
    );
  }

  return (
    <Page
      title="Combing Units"
      icon={Users}
      actions={
        <RefreshButton
          onClick={() => loadProcessors(true)}
          loading={refreshing}
          title="Refresh combing units"
        />
      }
    >
      <div className="space-y-6">
        {/* Combing Metrics KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Combing Units" value={processors.length} icon={Building2} tint="brand" />
          <StatCard label="Total Batches" value={overallSummary.batchCount} icon={Layers} tint="sky" />
          <StatCard
            label={`Processing Charges · Paid ₹${formatCurrency(overallSummary.totalPaid)}`}
            value={`₹${formatCurrency(overallSummary.totalCharges)}`}
            icon={Banknote}
            tint="brand"
          />
          <StatCard
            label="Processor Balance"
            value={`₹${formatCurrency(overallSummary.balanceDue)}`}
            icon={AlertCircle}
            tint={overallSummary.balanceDue > 0 ? 'red' : 'green'}
          />
        </div>

        {/* Search & Stats Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by mill name, owner, phone or address..."
            className="max-w-lg flex-1"
          />
          <Badge
            tone="brand"
            className="self-start px-3 py-1.5 text-xs font-semibold tabular-nums sm:self-auto"
          >
            {searchTerm.trim()
              ? `${filteredProcessors.length} of ${processors.length} Combing Units`
              : `${processors.length} Combing Units`}
          </Badge>
        </div>

        {/* Directory Rows */}
        {filteredProcessors.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={searchTerm.trim() ? 'No matching combing units' : 'No combing units saved yet'}
            message={
              searchTerm.trim()
                ? `No combing unit matches "${searchTerm}". Try a different name or phone number.`
                : 'Add your combing mills and units to easily load them when creating batches.'
            }
            action={
              <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
                Add First Combing Unit
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredProcessors.map((proc) => {
              const cleanPhone = digitsOnly(proc.phone || '');
              const name = proc.processorName || proc.name;
              const summary = calcProcessorBalanceSummary(batches, name);

              return (
                <div
                  key={proc.id || proc.phone || name}
                  className="group relative space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition duration-150 hover:border-slate-300 hover:shadow-card sm:p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Left: Mill Icon + Name & Owner */}
                    <div className="flex min-w-0 shrink-0 items-center gap-3.5 lg:w-72 xl:w-80">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 shadow-2xs">
                        <Building2 className="size-5 text-slate-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display text-base font-bold text-slate-900">{name}</h3>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <User className="size-3.5 shrink-0 text-gold-600" />
                          <span className="truncate">{proc.ownerName || 'Contact Person N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Phone with Quick Call/WhatsApp & Location */}
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:border-t-0 lg:pt-0">
                      {/* Phone with one-tap Call and WhatsApp */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-900 tabular-nums">
                          <Phone className="size-3.5 shrink-0 text-gold-600" />
                          <span>{proc.phone || 'N/A'}</span>
                        </div>
                        {cleanPhone && (
                          <div className="ml-1 flex items-center gap-1">
                            <a
                              href={`tel:${cleanPhone}`}
                              className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 shadow-2xs transition hover:border-slate-300 hover:bg-white hover:text-brand-800 sm:size-8"
                              title={`Call ${proc.phone}`}
                            >
                              <Phone className="size-3.5" />
                            </a>
                            <a
                              href={`https://wa.me/91${cleanPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex size-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-100 sm:size-8"
                              title={`WhatsApp ${proc.phone}`}
                            >
                              <MessageCircle className="size-3.5" />
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Address */}
                      <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-gold-600" />
                        <span className="truncate" title={proc.address}>
                          {proc.address || 'Address not specified'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 sm:justify-end lg:border-t-0 lg:pt-0">
                      <Link
                        to={`/combing/batches?search=${encodeURIComponent(name)}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-2.5 py-1.5 text-xs font-semibold text-brand-800 transition hover:border-brand-300 hover:bg-brand-100"
                      >
                        <span>View Batches</span>
                        <ExternalLink className="size-3 text-brand-600" />
                      </Link>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(proc)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none active:scale-95"
                          aria-label={`Edit ${name}`}
                        >
                          <Pencil className="size-3.5 text-slate-500" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(proc)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none active:scale-95"
                          aria-label={`Delete ${name}`}
                        >
                          <Trash2 className="size-3.5 text-slate-400" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Financial Balance Summary Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div>
                        <span className="text-slate-500">Batches:</span>{' '}
                        <b className="text-slate-900">{summary.batchCount}</b>
                      </div>
                      <div>
                        <span className="text-slate-500">Total Charges:</span>{' '}
                        <b className="text-slate-900">₹{formatCurrency(summary.totalCharges)}</b>
                      </div>
                      <div>
                        <span className="text-slate-500">Paid:</span>{' '}
                        <b className="text-emerald-700">₹{formatCurrency(summary.totalPaid)}</b>
                      </div>
                      <div>
                        <span className="text-slate-500">Balance Due:</span>{' '}
                        <b className={summary.balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                          ₹{formatCurrency(summary.balanceDue)}
                        </b>
                      </div>
                    </div>

                    <div>
                      {summary.totalCharges > 0 && summary.balanceDue === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                          <CheckCircle2 className="size-3 text-emerald-600" />
                          All Settled
                        </span>
                      ) : summary.balanceDue > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                          <AlertCircle className="size-3 text-rose-600" />
                          Due: ₹{formatCurrency(summary.balanceDue)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <button
        type="button"
        onClick={handleOpenAdd}
        aria-label="Add New Combing Unit"
        title="Add New Combing Unit"
        className="no-print fixed right-5 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-xl transition hover:bg-slate-800 focus-visible:outline-none active:scale-95 lg:bottom-6"
      >
        <Plus className="size-6 stroke-[2.5]" aria-hidden />
      </button>

      {/* Add / Edit Processor Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-brand-600" />
            <span>{editingProcessor ? 'Edit Combing Unit' : 'Add New Combing Unit'}</span>
          </div>
        }
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="processor-form"
              variant="primary"
              icon={editingProcessor ? Pencil : Plus}
              loading={saving}
            >
              {editingProcessor ? 'Save Changes' : 'Add Combing Unit'}
            </Button>
          </div>
        }
      >
        <form id="processor-form" onSubmit={handleSave} className="space-y-4">
          <TextField
            label="Combing Mill / Unit Name *"
            value={form.processorName}
            onChange={(v) => setForm((prev) => ({ ...prev, processorName: v }))}
            placeholder="e.g. Sri Lakshmi Combing & Mills"
            leftIcon={Building2}
            autoFocus
          />

          <TextField
            label="Owner / Contact Person Name *"
            value={form.ownerName}
            onChange={(v) => setForm((prev) => ({ ...prev, ownerName: v }))}
            placeholder="e.g. Lakshmi Narayanan"
            leftIcon={User}
          />

          <TextField
            label="Phone / Mobile Number *"
            value={form.phone}
            onChange={(v) => setForm((prev) => ({ ...prev, phone: v }))}
            placeholder="10-digit mobile number"
            leftIcon={Phone}
            type="tel"
          />

          <TextField
            label="Address"
            value={form.address}
            onChange={(v) => setForm((prev) => ({ ...prev, address: v }))}
            placeholder="Mill / factory location or city"
            leftIcon={MapPin}
          />
        </form>
      </Modal>
    </Page>
  );
}
