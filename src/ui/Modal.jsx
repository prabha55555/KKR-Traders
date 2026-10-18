import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

const SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };
/** Open dialogs, newest last: Escape closes only the topmost one (a zoomed image over a detail sheet, a confirm over a form). */
const openStack = [];

/**
 * Dialog for forms and detail views. A bottom sheet on phones, a centred dialog from the `sm` breakpoint up.
 * <Modal open onClose={…} title="Add payment" footer={<Button>Save</Button>}>…</Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissable = true,
  className,
  layer = 'z-50',
  ariaLabel,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const token = {};
    openStack.push(token);
    const onKey = (e) => {
      if (openStack[openStack.length - 1] !== token) return;
      if (e.key === 'Escape' && dismissable) closeRef.current?.();
      // Tab stays inside the dialog (it would otherwise walk into the page behind it)
      if (e.key === 'Tab' && panelRef.current) {
        const items = [
          ...panelRef.current.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!panelRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    // move focus into the dialog (the panel itself, so no keyboard pops up on phones)
    panelRef.current?.focus();
    return () => {
      const at = openStack.indexOf(token);
      if (at >= 0) openStack.splice(at, 1);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, dismissable]);

  if (!open) return null;
  return createPortal(
    <div className={cn('no-print fixed inset-0 flex items-end justify-center sm:items-center sm:p-4', layer)}>
      <div
        className="absolute inset-0 animate-fade-in bg-brand-950/55 backdrop-blur-[3px]"
        onClick={dismissable ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-sheet-in flex-col overflow-hidden rounded-t-3xl bg-white shadow-pop outline-none',
          'sm:max-h-[90dvh] sm:rounded-3xl',
          SIZES[size],
          className,
        )}
      >
        <span className="absolute inset-x-0 top-0 h-[2px] hairline-gold" aria-hidden />
        {/* phone grab handle */}
        <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        {title ? (
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
            <h2 id={titleId} className="truncate font-display text-base font-bold text-brand-800 sm:text-lg">
              {title}
            </h2>
            {dismissable ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1.5 rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none"
              >
                <X className="size-5" />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-slate-50/70 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-3.5 sm:pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Alias: a Modal used as a form / detail "sheet". */
export const Sheet = Modal;
