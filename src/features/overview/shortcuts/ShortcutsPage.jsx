/**
 * Product Shortcuts — replaces original-app/shortcut.html + js/shortcut.js (+ css/shortcut.css).
 * The product catalogue (key -> full description) the bill screens autocomplete from: KPI tiles, search, list
 * (table → cards on phones) with edit / delete, add + edit sheet (header button, floating "+" on phones).
 */
import { Check, Copy, Layers, ListFilter, Plus, SearchX, Sparkles, Zap, ZapOff } from 'lucide-react';
import { useMemo, useState } from 'react';

import { db } from '@/core/db';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  SearchBar,
  StatCard,
  useFeedback,
} from '@/ui';

import FloatingAddButton from '../components/FloatingAddButton';
import KeyCap from '../components/KeyCap';
import KpiRow from '../components/KpiRow';
import RefreshButton from '../components/RefreshButton';
import RowActions from '../components/RowActions';
import ShowMore from '../components/ShowMore';
import SkeletonRows from '../components/SkeletonRows';
import { usePagedRows } from '../components/paging';
import ShortcutFormModal from './ShortcutFormModal';
import { SHORTCUT_REQUIRED_MESSAGE, filterShortcuts, normaliseShortcut } from './shortcutsLogic';
import { updateShortcut } from './shortcutsService';

const EMPTY_FORM = { oldKey: '', key: '', description: '' };

export default function ShortcutsPage() {
  const { toast, confirm, loading: overlay } = useFeedback();
  const [shortcuts, setShortcuts] = useState([]);
  const [search, setSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const [testKey, setTestKey] = useState('');
  const [form, setForm] = useState(null); // null = sheet closed; oldKey '' = adding
  const [saving, setSaving] = useState(false);

  const { loading, refreshing, error, refresh, reload } = useFocusLoad(async () => {
    try {
      setShortcuts(await db.getAllShortcuts());
    } catch (e) {
      console.error('Error loading shortcuts:', e);
      throw new Error('Failed to load shortcuts. Please try again.');
    }
  });

  const shown = useMemo(() => filterShortcuts(shortcuts, search), [shortcuts, search]);
  const paged = usePagedRows(shown, search);

  const testMatch = useMemo(() => {
    const q = testKey.trim().toLowerCase();
    if (!q) return null;
    return shortcuts.find((s) => s.shortcutKey?.toLowerCase() === q);
  }, [shortcuts, testKey]);

  const handleCopy = (key, e) => {
    e?.stopPropagation?.();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
      toast('Copied!', `Shortcut key "${key}" copied to clipboard`, 'success');
    }
  };

  const onSave = async () => {
    if (!form || saving) return;
    const shortcut = normaliseShortcut(form.key, form.description);
    if (!shortcut) {
      toast('Warning', SHORTCUT_REQUIRED_MESSAGE, 'warning');
      return;
    }
    const adding = !form.oldKey;
    setSaving(true);
    try {
      // PARITY NOTE: an existing key is overwritten without warning (document id = key), as on the original page.
      if (adding)
        await overlay.run('Adding Shortcut', () => db.saveShortcut(shortcut), 'Saving to database...');
      else
        await overlay.run(
          'Updating Shortcut',
          () => updateShortcut(form.oldKey, shortcut),
          'Saving changes to database...',
        );
      setForm(null);
      await reload();
      toast(adding ? 'Shortcut added successfully!' : 'Shortcut updated successfully!', undefined, 'success');
    } catch (e) {
      console.error(adding ? 'Error adding shortcut:' : 'Error updating shortcut:', e);
      toast(
        adding ? 'Error adding shortcut. Please try again.' : 'Error updating shortcut. Please try again.',
        undefined,
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const onEdit = async (shortcut) => {
    try {
      const fresh = await overlay.run(
        'Loading Shortcut',
        () => db.getShortcut(shortcut.shortcutKey),
        'Fetching shortcut details...',
      );
      if (fresh)
        setForm({ oldKey: shortcut.shortcutKey, key: fresh.shortcutKey, description: fresh.fullDescription });
      else await reload();
    } catch (e) {
      console.error('Error loading shortcut for edit:', e);
      toast('Error loading shortcut for editing', undefined, 'error');
    }
  };

  const onDelete = async (shortcut) => {
    const ok = await confirm({
      title: 'Delete Shortcut',
      message: 'Are you sure you want to delete this shortcut?',
      tone: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await overlay.run(
        'Deleting Shortcut',
        async () => {
          await db.deleteShortcut(shortcut.shortcutKey);
          await reload();
        },
        'Removing from database...',
      );
      toast('Shortcut deleted successfully!', undefined, 'success');
    } catch (e) {
      console.error('Error deleting shortcut:', e);
      toast('Error deleting shortcut. Please try again.', undefined, 'error');
    }
  };

  const actions = (s) => (
    <RowActions
      editLabel={`Edit shortcut ${s.shortcutKey}`}
      deleteLabel={`Delete shortcut ${s.shortcutKey}`}
      onEdit={() => void onEdit(s)}
      onDelete={() => void onDelete(s)}
    />
  );

  const columns = [
    {
      key: 'key',
      header: 'Shortcut Key',
      className: 'w-48',
      render: (s) => (
        <div className="flex items-center gap-1.5">
          <KeyCap>{s.shortcutKey}</KeyCap>
          <button
            type="button"
            onClick={(e) => handleCopy(s.shortcutKey, e)}
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="Copy shortcut key"
            aria-label={`Copy shortcut key ${s.shortcutKey}`}
          >
            {copiedKey === s.shortcutKey ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Full Description',
      className: 'font-medium text-slate-800',
      value: (s) => s.fullDescription,
    },
    { key: 'actions', header: 'Actions', align: 'center', className: 'w-32', render: actions },
  ];

  const empty =
    shortcuts.length === 0 ? (
      <EmptyState
        icon={ZapOff}
        title="No Shortcuts Found"
        message="Add your first product shortcut using the Add button!"
      />
    ) : (
      <EmptyState icon={SearchX} title={`No results found for "${search}".`} />
    );

  let body;
  if (loading) body = <SkeletonRows count={5} height="h-16" />;
  else if (error) body = <ErrorState message={error} onRetry={() => void reload()} />;
  else
    body = (
      <>
        <DataTable
          columns={columns}
          rows={paged.rows}
          rowKey={(s) => s.shortcutKey}
          renderCard={(s) => (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <KeyCap>{s.shortcutKey}</KeyCap>
                  <button
                    type="button"
                    onClick={(e) => handleCopy(s.shortcutKey, e)}
                    className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    title="Copy shortcut key"
                    aria-label={`Copy shortcut key ${s.shortcutKey}`}
                  >
                    {copiedKey === s.shortcutKey ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <div className="mt-1.5 font-medium break-words text-slate-800">{s.fullDescription}</div>
              </div>
              {actions(s)}
            </div>
          )}
          empty={empty}
        />
        <ShowMore pager={paged.pager} noun="shortcuts" />
      </>
    );

  const openAdd = () => setForm(EMPTY_FORM);
  return (
    <Page
      title="Product Shortcuts"
      icon={Zap}
      actions={
        <>
          <RefreshButton onClick={refresh} refreshing={refreshing} />
          <Button icon={Plus} onClick={openAdd} className="max-sm:hidden">
            Add Shortcut
          </Button>
        </>
      }
    >
      <KpiRow cols={2}>
        <StatCard
          icon={Layers}
          label="Total shortcuts"
          value={loading ? '…' : shortcuts.length}
          tint="brand"
        />
        <StatCard
          icon={ListFilter}
          label={search.trim() ? 'Matching search' : 'Showing'}
          value={loading ? '…' : shown.length}
          tint="violet"
        />
      </KpiRow>
      <Card className="mb-5 space-y-3 bg-white/80 p-3 sm:p-3.5">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search shortcuts..."
          aria-label="Search shortcuts"
        />
        <div className="border-t border-slate-100 pt-3">
          <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center">
            <span className="flex items-center gap-1.5 font-semibold text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Test Autocomplete:
            </span>
            <div className="flex flex-1 items-center gap-2">
              <input
                type="text"
                value={testKey}
                onChange={(e) => setTestKey(e.target.value)}
                placeholder="Type a key (e.g. 101)..."
                className="max-w-xs rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-brand-500 focus:outline-none"
              />
              {testKey.trim() &&
                (testMatch ? (
                  <span className="inline-flex max-w-md items-center gap-1 truncate rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                    <Check className="h-3 w-3 shrink-0" />
                    Expands to: &ldquo;{testMatch.fullDescription}&rdquo;
                  </span>
                ) : (
                  <span className="text-slate-400 italic">No exact shortcut match</span>
                ))}
            </div>
          </div>
        </div>
      </Card>
      {body}
      <FloatingAddButton label="Add shortcut" onClick={openAdd} />
      <ShortcutFormModal
        state={form}
        onChange={setForm}
        saving={saving}
        onClose={() => setForm(null)}
        onSave={() => void onSave()}
      />
    </Page>
  );
}
