/**
 * The buttons of the web page's side menu (Generate BILL / Share BILL / Save BILL).
 *
 * Props
 *  - layout: 'bar' (phones: one row of icon-over-label buttons, Save widest) | 'panel' (desktop side card)
 *  - saveLabel: string          "Save Bill" or "Update Bill" (edit mode)
 *  - onSave / onGenerate / onShare: () => void
 */
import { FileText, RotateCcw, Save, Share2 } from 'lucide-react';
import { Button } from '@/ui';

// Colour = purpose (ACTION COLOURS in Button.jsx): Save green · Generate gold · Share purple · Clear amber · New gold.
// Phone bar: equal columns that may shrink, a long label ("Update Bill") wraps instead of overflowing on a 360px phone.
const barBtn =
  'min-h-14! min-w-0! flex-1 flex-col! gap-0.5! rounded-xl! px-1! text-xs! leading-tight! whitespace-normal! text-center';

export function BillActionBar({
  layout = 'bar',
  saveLabel,
  saved = false,
  onSave,
  onGenerate,
  onShare,
  onReset,
}) {
  const saveA11y = `${saveLabel.split(' ')[0]} BILL`;
  const resetVariant = saved ? 'outlineGold' : 'outlineWarning';
  if (layout === 'panel') {
    return (
      <div className="space-y-2.5">
        <Button fullWidth size="lg" variant="success" icon={Save} aria-label={saveA11y} onClick={onSave}>
          {saveLabel}
        </Button>
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="primary" icon={FileText} aria-label="Generate BILL" onClick={onGenerate}>
            Generate BILL
          </Button>
          <Button variant="purple" icon={Share2} aria-label="Share BILL" onClick={onShare}>
            Share BILL
          </Button>
        </div>
        {onReset && (
          <Button fullWidth variant={resetVariant} icon={RotateCcw} onClick={onReset}>
            {saved ? 'New Bill' : 'Clear Form'}
          </Button>
        )}
        <p className="pt-0.5 text-center text-xs text-slate-400">
          Shortcut:{' '}
          <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans font-semibold text-slate-600">
            Ctrl
          </kbd>{' '}
          +{' '}
          <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans font-semibold text-slate-600">
            S
          </kbd>{' '}
          to save
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button className={barBtn} variant="success" icon={Save} aria-label={saveA11y} onClick={onSave}>
        {saveLabel}
      </Button>
      <Button
        className={barBtn}
        variant="primary"
        icon={FileText}
        aria-label="Generate BILL"
        onClick={onGenerate}
      >
        Generate
      </Button>
      <Button className={barBtn} variant="purple" icon={Share2} aria-label="Share BILL" onClick={onShare}>
        Share
      </Button>
      {onReset && (
        <Button
          className={barBtn}
          variant={resetVariant}
          icon={RotateCcw}
          aria-label={saved ? 'New Bill' : 'Clear Form'}
          onClick={onReset}
        >
          {saved ? 'New' : 'Clear'}
        </Button>
      )}
    </div>
  );
}
