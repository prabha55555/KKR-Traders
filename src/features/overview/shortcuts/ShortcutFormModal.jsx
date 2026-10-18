import { Plus, Save } from 'lucide-react';

import { Button, Modal, TextField } from '@/ui';

import KeyCap from '../components/KeyCap';
import { SHORTCUT_KEY_MAX_LENGTH } from './shortcutsLogic';

const FORM_ID = 'shortcut-form';

/**
 * "Add New Shortcut" / "Edit Shortcut" sheet. `state` = { oldKey, key, description } (oldKey '' when adding),
 * null while closed. Enter submits.
 */
export default function ShortcutFormModal({ state, onChange, saving, onClose, onSave }) {
  const adding = !state?.oldKey;
  return (
    <Modal
      open={state !== null}
      onClose={saving ? undefined : onClose}
      title={adding ? 'Add New Shortcut' : 'Edit Shortcut'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            icon={adding ? Plus : Save}
            loading={saving}
            className="max-sm:flex-1"
          >
            {adding ? 'Add Shortcut' : 'Save Changes'}
          </Button>
        </>
      }
    >
      {state ? (
        <form
          id={FORM_ID}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          {adding ? (
            <p className="rounded-xl bg-gold-50/60 px-3.5 py-2.5 text-sm text-slate-600 ring-1 ring-gold-100">
              Create shortcuts for frequently used product descriptions
            </p>
          ) : null}
          <TextField
            label="Shortcut Key:"
            value={state.key}
            onChange={(key) => onChange({ ...state, key })}
            placeholder="e.g., Wm, Usb c, Dl"
            maxLength={SHORTCUT_KEY_MAX_LENGTH}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
          />
          <TextField
            label="Full Description:"
            value={state.description}
            onChange={(description) => onChange({ ...state, description })}
            placeholder="e.g., Wireless Mouse, USB Cable, Desk Lamp"
            autoCapitalize="words"
            autoComplete="off"
          />
          {state.key.trim() || state.description.trim() ? (
            <div
              className="flex items-center gap-3 rounded-xl border border-dashed border-gold-300 bg-slate-50/70 px-3.5 py-2.5"
              aria-hidden
            >
              <span className="text-[11px] font-bold tracking-[0.08em] text-slate-500 uppercase">
                Preview
              </span>
              <KeyCap>{state.key.trim() || '…'}</KeyCap>
              <span className="min-w-0 truncate text-sm font-medium text-slate-700">
                {state.description.trim()}
              </span>
            </div>
          ) : null}
        </form>
      ) : null}
    </Modal>
  );
}
