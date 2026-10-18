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
import { cn } from '@/ui/cn';

// Colour = purpose: Save green · Generate gold · Share purple (see Button.jsx)
const barBtn = 'min-h-14! flex-col! gap-0.5! rounded-xl! px-1! text-xs!';

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
  if (layout === 'panel') {
    return (
      <div className="space-y-2.5">
        <Button fullWidth size="lg" variant="success" icon={Save} aria-label={saveA11y} onClick={onSave}>
          {saveLabel}
        </Button>
        <div className="grid grid-cols-2 gap-2.5">
          <Button icon={FileText} aria-label="Generate BILL" onClick={onGenerate}>
            Generate BILL
          </Button>
          <Button variant="purple" icon={Share2} aria-label="Share BILL" onClick={onShare}>
            Share BILL
          </Button>
        </div>
        {onReset && (
          <Button fullWidth variant="outline" icon={RotateCcw} onClick={onReset}>
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
      <Button
        className={cn(barBtn, 'flex-1')}
        variant="success"
        icon={Save}
        aria-label={saveA11y}
        onClick={onSave}
      >
        {saveLabel}
      </Button>
      <Button
        className={cn(barBtn, 'flex-1')}
        icon={FileText}
        aria-label="Generate BILL"
        onClick={onGenerate}
      >
        Generate
      </Button>
      <Button
        className={cn(barBtn, 'flex-1')}
        variant="purple"
        icon={Share2}
        aria-label="Share BILL"
        onClick={onShare}
      >
        Share
      </Button>
      {onReset && (
        <Button
          className={cn(barBtn, 'flex-1')}
          variant="outline"
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
