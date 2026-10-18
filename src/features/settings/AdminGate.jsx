/**
 * The Settings page is for the Brightlight Solutions administrator only: until the administrator signs in (on this
 * browser tab, for core/admin.js ADMIN_MINUTES), the page shows this sign-in card instead of the settings.
 */
import { Lock, LockOpen, Settings, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { adminUnlockedUntil, isAdminUnlocked, lockAdmin, subscribeAdmin, unlockAdmin } from '@/core/admin';
import { VENDOR } from '@/core/branding';
import { Badge, Button, Card, Page, SectionHeader, TextField, useFeedback } from '@/ui';
import { isSettingsDirty } from './dirtyGuard';

/** How often an open Settings page re-checks that the administrator's 30 minutes have not run out. */
const EXPIRY_CHECK_MS = 30_000;

/** Is the administrator signed in (re-renders on unlock / lock)? */
export function useAdminUnlocked() {
  const unlocked = useSyncExternalStore(
    subscribeAdmin,
    () => isAdminUnlocked(),
    () => false,
  );
  const [, tick] = useState(0);
  // the unlock ends by time, not by an event: re-check so the form disappears when it expires
  useEffect(() => {
    if (!unlocked) return undefined;
    const timer = setInterval(() => tick((n) => n + 1), EXPIRY_CHECK_MS);
    return () => clearInterval(timer);
  }, [unlocked]);
  return unlocked && isAdminUnlocked();
}

function AdminSignIn() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setError('');
    try {
      const ok = await unlockAdmin(username, password);
      if (!ok) {
        setError('Wrong administrator username or password.');
        setPassword('');
      }
    } finally {
      busy.current = false;
      setChecking(false);
    }
  };

  return (
    <Page title="Settings" icon={Settings} max="4xl">
      <Card as="section" aria-label="Administrator sign-in" className="mx-auto max-w-md">
        <SectionHeader title="Administrator sign-in" icon={ShieldCheck} />
        <p className="-mt-1 mb-4 text-sm text-slate-600">
          Settings (business details, modules and the client login) can only be changed by the administrator
          from {VENDOR.name}. For changes, please contact {VENDOR.phoneDisplay}.
        </p>
        <form onSubmit={onSubmit} noValidate aria-label="Administrator sign-in" className="space-y-4">
          <TextField
            label="Administrator username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(v) => {
              setUsername(v);
              setError('');
            }}
          />
          <TextField
            label="Administrator password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError('');
            }}
          />
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200"
            >
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" icon={LockOpen} loading={checking} fullWidth>
            Unlock Settings
          </Button>
        </form>
      </Card>
    </Page>
  );
}

/** Settings content for the administrator; the sign-in card for anyone else. */
export function AdminGate({ children }) {
  const unlocked = useAdminUnlocked();
  const { confirm } = useFeedback();
  if (!unlocked) return <AdminSignIn />;
  const onLock = async () => {
    if (
      isSettingsDirty() &&
      !(await confirm({
        title: 'Lock Settings?',
        message: 'You have unsaved changes. Locking Settings will discard them.',
        tone: 'danger',
        confirmText: 'Lock and discard',
      }))
    )
      return;
    lockAdmin();
  };
  const until = new Date(adminUnlockedUntil());
  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-end gap-2 px-3.5 pt-4 sm:px-6 lg:px-8">
        <Badge tone="success" icon={ShieldCheck}>
          Administrator · until {until.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </Badge>
        <Button variant="outlineWarning" size="sm" icon={Lock} onClick={onLock}>
          Lock Settings
        </Button>
      </div>
      {children}
    </>
  );
}
