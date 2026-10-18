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
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Page,
  SearchBar,
  StatCard,
  StatGrid,
  TextField,
  useFeedback,
} from '@/ui';

import FloatingAddButton from '../components/FloatingAddButton';
import KeyCap from '../components/KeyCap';
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

  const { loading, error, reload } = useFocusLoad(async () => {
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

  const copyButton = (s) => {
    const copied = copiedKey === s.shortcutKey;
    return (
      <IconButton
        icon={copied ? Check : Copy}
        label={`Copy shortcut key ${s.shortcutKey}`}
        onClick={(e) => handleCopy(s.shortcutKey, e)}
        variant={copied ? 'outlineSuccess' : 'outline'}
      />
    );
  };

  const columns = [
    {
      key: 'key',
      header: 'Shortcut Key',
      className: 'w-48',
      render: (s) => (
        <div className="flex items-center gap-1.5">
          <KeyCap>{s.shortcutKey}</KeyCap>
          {copyButton(s)}
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Full Description',
      className: 'font-medium break-words text-slate-800',
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
                  {copyButton(s)}
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
        <Button variant="primary" icon={Plus} onClick={openAdd} className="max-sm:hidden">
          Add Shortcut
        </Button>
      }
    >
      <StatGrid cols={2} className="mb-5">
        <StatCard
          icon={Layers}
          label="Total shortcuts"
          value={loading ? '…' : shortcuts.length}
          tone="info"
        />
        <StatCard
          icon={ListFilter}
          label={search.trim() ? 'Matching search' : 'Showing'}
          value={loading ? '…' : shown.length}
          tone="brand"
        />
      </StatGrid>
      <Card className="mb-5 space-y-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search shortcuts..."
          aria-label="Search shortcuts"
        />
        <div className="border-t border-line pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Sparkles className="size-3.5 text-gold-600" aria-hidden />
              Test Autocomplete:
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <TextField
                value={testKey}
                onChange={setTestKey}
                placeholder="Type a key (e.g. 101)..."
                aria-label="Test autocomplete key"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                className="w-full max-w-xs"
              />
              {testKey.trim() &&
                (testMatch ? (
                  <span title={testMatch.fullDescription} className="inline-flex max-w-full min-w-0">
                    <Badge tone="success">
                      <Check className="mr-1 inline size-3 align-[-1px]" aria-hidden />
                      Expands to: &ldquo;{testMatch.fullDescription}&rdquo;
                    </Badge>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 italic">No exact shortcut match</span>
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
