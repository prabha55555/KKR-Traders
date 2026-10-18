import { RefreshCw } from 'lucide-react';
import { Button } from './Button';

/**
 * The one Refresh button of the app: blue "refresh" variant, icon + "Refresh" text on every screen size.
 * While `loading` the icon becomes a spinner and the button is disabled. Extra props (aria-label, title…) pass through.
 */
export function RefreshButton({
  onClick,
  loading = false,
  refreshing,
  disabled,
  children = 'Refresh',
  ...rest
}) {
  const isLoading = Boolean(loading || refreshing);
  return (
    <Button
      variant="refresh"
      icon={RefreshCw}
      loading={isLoading}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </Button>
  );
}
