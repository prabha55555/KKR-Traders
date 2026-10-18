import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

export function Spinner({ className }) {
  return (
    <span
      className={cn(
        'inline-block size-6 animate-spin rounded-full border-[3px] border-gold-200 border-t-gold-500',
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingState({ label = 'Loading…', className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-20 text-slate-500', className)}>
      <Spinner className="size-9" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-16 text-center', className)}>
      <span className="flex size-16 items-center justify-center rounded-2xl bg-gold-50 text-gold-600 ring-1 ring-gold-200">
        <Icon className="size-8" aria-hidden />
      </span>
      <h3 className="mt-1 font-display text-base font-bold text-brand-800">{title}</h3>
      {message ? <p className="max-w-sm text-sm text-slate-500">{message}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message = 'Something went wrong while loading.', onRetry, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-4 py-14 text-center', className)}>
      <span className="flex size-16 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-200">
        <AlertCircle className="size-8" aria-hidden />
      </span>
      <p className="max-w-sm text-sm text-slate-600">{message}</p>
      {onRetry ? (
        <Button variant="outline" icon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Shimmering placeholder block: <Skeleton className="h-4 w-32" /> */
export function Skeleton({ className }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-linear-to-r from-slate-100 via-slate-200/70 to-slate-100',
        className,
      )}
      aria-hidden
    />
  );
}
