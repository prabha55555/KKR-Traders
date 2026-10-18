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
  RefreshCw,
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
  SearchBar,
  StatCard,
  TextField,
  cn,
  useFeedback,
} from '@/ui';
import DyeingNavTabs from './DyeingNavTabs';
import { calcDyerBalanceSummary, emptyDyer, filterDyers, validateDyer } from './dyeingLogic';
import { deleteDyerRecord, getAllDyersList, saveDyerRecord } from './dyeingService';

export default function DyeingDetailsPage() {
  const { toast, confirm } = useFeedback();

  const [dyers, setDyers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDyer, setEditingDyer] = useState(null);
  const [form, setForm] = useState(emptyDyer());
  const [saving, setSaving] = useState(false);

  const loadDyers = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [list, batchList] = await Promise.all([
        getAllDyersList(),
        db.getAllDyeingBatches ? db.getAllDyeingBatches() : Promise.resolve([]),
      ]);
      setDyers(list || []);
      setBatches(batchList || []);
    } catch (err) {
      console.error('Failed to load dyers directory:', err);
      setError(err.message || 'Could not load dyers.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDyers();
  }, [loadDyers]);

  const filteredDyers = useMemo(() => {
    return filterDyers(dyers, searchTerm);
  }, [dyers, searchTerm]);

  const overallSummary = useMemo(() => {
    return calcDyerBalanceSummary(batches);
  }, [batches]);

  const handleOpenAdd = () => {
    setEditingDyer(null);
    setForm(emptyDyer());
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dyer) => {
    setEditingDyer(dyer);
    setForm({
      id: dyer.id,
      dyeingName: dyer.dyeingName || '',
      ownerName: dyer.ownerName || '',
      phone: dyer.phone || '',
      address: dyer.address || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (saving) return;

    const validation = validateDyer(form);
    if (validation) {
      toast(validation.title, validation.message, 'error');
      return;
    }

    try {
      setSaving(true);
      await saveDyerRecord(form);
      toast(
        editingDyer ? 'Dyer Updated' : 'Dyer Added',
        `${form.dyeingName} has been saved to your directory.`,
        'success',
      );
      setIsModalOpen(false);
      loadDyers(true);
    } catch (err) {
      toast('Save Failed', err.message || 'Could not save dyer details.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dyer) => {
    const ok = await confirm({
      title: `Delete ${dyer.dyeingName}?`,
      message: `Are you sure you want to remove "${dyer.dyeingName}" (${dyer.ownerName}) from your dyeing directory?`,
      tone: 'danger',
      confirmText: 'Delete Dyer',
    });
    if (!ok) return;

    try {
      await deleteDyerRecord(dyer.id || dyer.phone);
      toast('Dyer Removed', `${dyer.dyeingName} was removed.`, 'success');
      loadDyers(true);
    } catch (err) {
      toast('Delete Failed', err.message || 'Could not delete dyer.', 'error');
    }
  };

  if (loading && dyers.length === 0) {
    return (
      <Page title="Dyeing Details" icon={Users}>
        <LoadingState label="Loading dyeing units directory…" />
      </Page>
    );
  }

  if (error && dyers.length === 0) {
    return (
      <Page title="Dyeing Details" icon={Users}>
        <ErrorState message={error} onRetry={() => loadDyers(false)} />
      </Page>
    );
  }

  return (
    <Page
      title={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="size-6 text-brand-600" />
              <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Dyeing Details
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Directory of dye houses, processing mills, contact persons and addresses
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={RefreshCw}
              onClick={() => loadDyers(true)}
              loading={refreshing}
              title="Refresh dyers"
            >
              Refresh
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <DyeingNavTabs
          counts={{
            ongoing: batches.filter((b) => b.status !== 'COMPLETED').length,
            settled: batches.filter((b) => b.status === 'COMPLETED').length,
            dyers: dyers.length,
          }}
        />

        {/* Dyer Metrics KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Dyeing Units"
            value={dyers.length}
            icon={Building2}
            tone="brand"
            subtext="Registered dyers"
          />
          <StatCard
            label="Total Batches"
            value={overallSummary.batchCount}
            icon={Layers}
            tone="info"
            subtext="Across all units"
          />
          <StatCard
            label="Total Dyeing Charges"
            value={`₹${formatCurrency(overallSummary.totalCharges)}`}
            icon={Banknote}
            tone="brand"
            subtext={`Paid: ₹${formatCurrency(overallSummary.totalPaid)}`}
          />
          <StatCard
            label="Dyer Balance Due"
            value={`₹${formatCurrency(overallSummary.balanceDue)}`}
            icon={AlertCircle}
            tone={overallSummary.balanceDue > 0 ? 'danger' : 'success'}
            subtext={overallSummary.balanceDue > 0 ? 'Outstanding payable' : 'All settled'}
          />
        </div>

        {/* Search & Stats Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by dyeing name, owner, phone or address..."
            className="flex-1 max-w-lg"
          />
          <Badge tone="brand" className="self-start px-3 py-1.5 text-xs font-semibold tabular-nums sm:self-auto">
            {searchTerm.trim()
              ? `${filteredDyers.length} of ${dyers.length} Dyeing Units`
              : `${dyers.length} Dyeing Units`}
          </Badge>
        </div>

        {/* Directory Cards */}
        {filteredDyers.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={searchTerm.trim() ? 'No matching dyeing units' : 'No dyeing units saved yet'}
            message={
              searchTerm.trim()
                ? `No dyer matches "${searchTerm}". Try a different name or phone number.`
                : 'Add your dye houses and processors to easily load them when creating batches.'
            }
            action={
              <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
                Add First Dyer
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredDyers.map((dyer) => {
              const cleanPhone = digitsOnly(dyer.phone || '');
              const summary = calcDyerBalanceSummary(batches, dyer.dyeingName);

              return (
                <div
                  key={dyer.id || dyer.phone || dyer.dyeingName}
                  className="group relative rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs transition duration-150 hover:border-slate-300 hover:shadow-card space-y-3"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Left: Mill Icon + Dyeing Unit Name & Owner */}
                    <div className="flex items-center gap-3.5 min-w-0 lg:w-72 xl:w-80 shrink-0">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 shadow-2xs">
                        <Building2 className="size-5 text-slate-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-base font-bold text-slate-900 truncate">
                          {dyer.dyeingName}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mt-0.5">
                          <User className="size-3.5 text-gold-600 shrink-0" />
                          <span className="truncate">{dyer.ownerName || 'Contact Person N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Phone with Quick Call/WhatsApp & Location */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-w-0 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
                      {/* Phone with one-tap Call and WhatsApp */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-900 tabular-nums">
                          <Phone className="size-3.5 text-gold-600 shrink-0" />
                          <span>{dyer.phone || 'N/A'}</span>
                        </div>
                        {cleanPhone && (
                          <div className="flex items-center gap-1 ml-1">
                            <a
                              href={`tel:${cleanPhone}`}
                              className="flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-white hover:text-brand-800 hover:border-slate-300 shadow-2xs"
                              title={`Call ${dyer.phone}`}
                            >
                              <Phone className="size-3.5" />
                            </a>
                            <a
                              href={`https://wa.me/91${cleanPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex size-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 hover:border-emerald-300 shadow-2xs"
                              title={`WhatsApp ${dyer.phone}`}
                            >
                              <MessageCircle className="size-3.5" />
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Address */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
                        <MapPin className="size-3.5 text-gold-600 shrink-0 mt-0.5" />
                        <span className="truncate" title={dyer.address}>
                          {dyer.address || 'Address not specified'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0 shrink-0">
                      <Link
                        to={`/dyeing/batches?search=${encodeURIComponent(dyer.dyeingName)}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-2.5 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 hover:border-brand-300"
                      >
                        <span>View Batches</span>
                        <ExternalLink className="size-3 text-brand-600" />
                      </Link>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(dyer)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                          aria-label={`Edit ${dyer.dyeingName}`}
                        >
                          <Pencil className="size-3.5 text-slate-500" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(dyer)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                          aria-label={`Delete ${dyer.dyeingName}`}
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
                        <b
                          className={summary.balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}
                        >
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
        aria-label="Add New Dyer"
        title="Add New Dyer"
        className="no-print fixed right-5 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] sm:bottom-6 z-30 flex size-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl border-2 border-white transition hover:bg-slate-800 active:scale-95 focus-visible:outline-none"
      >
        <Plus className="size-6 stroke-[2.5]" aria-hidden />
      </button>

      {/* Add / Edit Dyer Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-brand-600" />
            <span>{editingDyer ? 'Edit Dyeing Details' : 'Add New Dyeing Unit'}</span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="dyer-form"
              variant="primary"
              icon={editingDyer ? Pencil : Plus}
              loading={saving}
            >
              {editingDyer ? 'Save Changes' : 'Add Dyer'}
            </Button>
          </div>
        }
      >
        <form id="dyer-form" onSubmit={handleSave} className="space-y-4">
          <TextField
            label="Dyeing / Mill Name *"
            value={form.dyeingName}
            onChange={(v) => setForm((prev) => ({ ...prev, dyeingName: v }))}
            placeholder="e.g. Sri Murugan Dyeing Works"
            leftIcon={Building2}
            autoFocus
          />

          <TextField
            label="Dyeing Owner / Contact Person Name *"
            value={form.ownerName}
            onChange={(v) => setForm((prev) => ({ ...prev, ownerName: v }))}
            placeholder="e.g. Murugan"
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
