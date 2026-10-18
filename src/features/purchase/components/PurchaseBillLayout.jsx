/**
 * Shared shell of the Purchase Bill and Edit Purchase screens (the web pages had a side menu with the Save and
 * "Share Acknowledgement" buttons next to the form).
 * Desktop (expanded): form on the left, totals + Actions card in the sticky right column (TwoPane).
 * Phones/tablets: stacked cards with a sticky action bar (Save + Share Acknowledgement) above the tab bar.
 * Ctrl/Cmd + S saves on keyboards (the browser's "save page" is suppressed on this screen).
 *
 * Props
 *  - title: string · icon?: lucide component
 *  - main: ReactNode            invoice, supplier and product cards
 *  - summary: ReactNode         the totals card
 *  - saveLabel: string          "Save Purchase Bill" | "Update Purchase Bill"
 *  - saving: boolean
 *  - onSave() · onShare()
 *  - onRefresh?() · refreshing?: boolean     adds a refresh button to the page header
 */
import { Receipt, Save, Share2, Zap } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Button, Card, Page, RefreshButton, SectionHeader, TwoPane } from '@/ui';
import { cn } from '@/ui/cn';

// Save = green (confirm), Acknowledge = purple (share) so the two never look alike.
const barBtn = 'min-h-14! flex-col! gap-0.5! rounded-xl! px-1! text-xs!';

function ActionButtons({ layout, saveLabel, saving, onSave, onShare }) {
  if (layout === 'panel') {
    return (
      <div className="space-y-2.5">
        <Button fullWidth size="lg" variant="success" icon={Save} loading={saving} onClick={onSave}>
          {saveLabel}
        </Button>
        <Button fullWidth size="lg" variant="purple" icon={Share2} onClick={onShare}>
          Share Acknowledgement
        </Button>
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
        loading={saving}
        aria-label={saveLabel}
        onClick={onSave}
      >
        {saveLabel.split(' ')[0]}
      </Button>
      <Button
        className={cn(barBtn, 'flex-1')}
        variant="purple"
        icon={Share2}
        aria-label="Share Acknowledgement"
        onClick={onShare}
      >
        Acknowledge
      </Button>
    </div>
  );
}

export function PurchaseBillLayout({
  title,
  icon = Receipt,
  main,
  summary,
  saveLabel,
  saving,
  onSave,
  onShare,
  onRefresh,
  refreshing,
}) {
  const { isExpanded } = useBreakpoint();
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const buttons = (layout) => (
    <ActionButtons layout={layout} saveLabel={saveLabel} saving={saving} onSave={onSave} onShare={onShare} />
  );
  return (
    <Page
      title={title}
      icon={icon}
      max="7xl"
      actions={
        onRefresh ? (
          <RefreshButton
            onClick={onRefresh}
            loading={refreshing}
            aria-label="Refresh suppliers and invoice numbers"
            title="Refresh suppliers and invoice numbers"
          />
        ) : null
      }
    >
      <TwoPane
        main={main}
        side={
          <>
            {summary}
            {isExpanded ? (
              <Card>
                <SectionHeader title="Actions" icon={Zap} />
                {buttons('panel')}
              </Card>
            ) : null}
          </>
        }
      />
      {isExpanded ? null : (
        <div className="no-print sticky bottom-[calc(3.7rem+env(safe-area-inset-bottom))] z-20 mt-4 rounded-2xl border border-line bg-white p-2 shadow-pop ring-1 ring-brand-900/5">
          {buttons('bar')}
        </div>
      )}
    </Page>
  );
}
