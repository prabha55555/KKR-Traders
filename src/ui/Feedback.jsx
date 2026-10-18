/**
 * Toast / confirm dialog / loading overlay — replacements for the original site's Utils.showToast, Utils.showConfirm
 * and showLoading()/hideLoading().
 *
 *   const { toast, confirm, loading } = useFeedback();
 *   toast('Bill Saved', 'Invoice #001', 'success');            // types: success | error | warning | info
 *   if (await confirm({ title: 'Delete?', message: '…', tone: 'danger', confirmText: 'Delete' })) { … }
 *   await loading.run('Saving…', () => save(), 'Please wait');   // overlay while the promise runs
 */
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { cn } from './cn';
import { Modal } from './Modal';

const FeedbackContext = createContext(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}

const TOAST_MS = 4000;

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [loadingState, setLoadingState] = useState(null);
  const depth = useRef(0);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (title, message, type = 'info') => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, title, message, type }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const confirm = useCallback((opts) => new Promise((resolve) => setConfirmState({ opts, resolve })), []);
  const answer = (value) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  const loading = useMemo(() => {
    const enter = (message = 'Loading…', subtext) => {
      depth.current += 1;
      setLoadingState({ message, subtext });
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setLoadingState(null);
    };
    return {
      show: enter,
      hide: leave,
      run: async (message, fn, subtext) => {
        enter(message, subtext);
        try {
          return await fn();
        } finally {
          leave();
        }
      },
    };
  }, []);

  const api = useMemo(() => ({ toast, confirm, loading }), [toast, confirm, loading]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
      <ConfirmDialog state={confirmState} onAnswer={answer} />
      <LoadingOverlay state={loadingState} />
    </FeedbackContext.Provider>
  );
}

const TOAST_STYLE = {
  success: { Icon: CheckCircle2, bar: 'border-l-emerald-500', icon: 'text-emerald-500' },
  error: { Icon: XCircle, bar: 'border-l-red-500', icon: 'text-red-500' },
  warning: { Icon: AlertTriangle, bar: 'border-l-amber-400', icon: 'text-amber-500' },
  info: { Icon: Info, bar: 'border-l-sky-500', icon: 'text-sky-500' },
};

function ToastHost({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div
      className="no-print pt-safe pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const s = TOAST_STYLE[t.type] ?? TOAST_STYLE.info;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onDismiss(t.id)}
            role="alert"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-2xl border border-l-4 border-white/70 glass bg-white/95 p-3.5 text-left shadow-lift ring-1 ring-brand-900/5',
              s.bar,
            )}
          >
            <s.Icon className={cn('mt-0.5 size-5 shrink-0', s.icon)} aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{t.title}</span>
              {t.message ? <span className="mt-0.5 block text-sm text-slate-600">{t.message}</span> : null}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

function ConfirmDialog({ state, onAnswer }) {
  const opts = state?.opts;
  const danger = opts?.tone === 'danger';
  return (
    <Modal open={!!state} onClose={() => onAnswer(false)} size="sm" layer="z-[60]">
      <div className="flex flex-col items-center text-center">
        <span
          className={cn(
            'mb-3 flex size-16 items-center justify-center rounded-2xl ring-1 ring-inset',
            danger ? 'bg-red-50 text-red-600 ring-red-200' : 'bg-gold-50 text-gold-600 ring-gold-200',
          )}
        >
          {danger ? <XCircle className="size-8" /> : <AlertTriangle className="size-8" />}
        </span>
        <h3 className="font-display text-lg font-bold text-brand-800">{opts?.title}</h3>
        {opts?.message ? (
          <p className="mt-1.5 text-sm whitespace-pre-line text-slate-600">{opts.message}</p>
        ) : null}
        <div className="mt-5 flex w-full gap-3">
          <Button variant="outline" className="flex-1" onClick={() => onAnswer(false)}>
            {opts?.cancelText ?? 'Cancel'}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={() => onAnswer(true)}>
            {opts?.confirmText ?? 'OK'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function LoadingOverlay({ state }) {
  if (!state) return null;
  return createPortal(
    <div
      className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-brand-950/35 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-56 flex-col items-center rounded-3xl bg-white px-9 py-7 shadow-pop">
        <span className="size-10 animate-spin rounded-full border-4 border-gold-200 border-t-gold-500" />
        <p className="mt-4 text-center font-display text-sm font-bold text-brand-800">{state.message}</p>
        {state.subtext ? <p className="mt-1 text-center text-xs text-slate-500">{state.subtext}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
