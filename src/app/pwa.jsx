import { Download, RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Button } from '@/ui';

/** Centred popup shown when a new version of the app has been downloaded; the user decides when to reload. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // look for a new version every hour while the app stays open
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div
      className="no-print fixed inset-0 z-[80] flex animate-fade-in items-center justify-center bg-brand-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
    >
      <div className="w-full max-w-sm animate-sheet-in rounded-3xl border border-line bg-white p-6 text-center shadow-pop">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gold-sheen text-brand-900 shadow-gold">
          <RefreshCw className="size-7" aria-hidden />
        </span>
        <h2 id="update-title" className="mt-4 font-display text-xl font-extrabold text-brand-800">
          Update available
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          A new version of Brightlight Billing is ready. Update now to get the latest improvements.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
          <Button variant="primary" icon={RefreshCw} onClick={() => updateServiceWorker(true)}>
            Update
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Thin bar shown while the device is offline (data is read from the on-device cache). */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="no-print flex items-center justify-center gap-2 bg-amber-400 px-3 py-1.5 text-center text-xs font-semibold text-slate-900">
      <WifiOff className="size-4" aria-hidden />
      You are offline — showing saved data. Changes need a connection.
    </div>
  );
}

/** Captures the browser's "install app" event so the dashboard can offer an Install button. */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true,
  );

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return {
    installed,
    canInstall: !!deferred,
    /** iOS Safari has no install event: users add the app from the Share menu */
    showIosHint: isIos && !installed,
    install: async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    },
  };
}

export function InstallButton({ className }) {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <Button variant="outline" icon={Download} onClick={install} className={className}>
      Install app
    </Button>
  );
}
