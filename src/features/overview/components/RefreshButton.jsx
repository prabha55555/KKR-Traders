import { RefreshButton as UiRefreshButton } from '@/ui';

/**
 * Page-header refresh action (drops the in-memory cache, see useFocusLoad().refresh) — the shared app-wide Refresh button.
 * Accepts `refreshing` or `loading`; other props (aria-label, title…) pass through.
 */
export default function RefreshButton({ refreshing, loading, ...rest }) {
  return <UiRefreshButton loading={Boolean(refreshing || loading)} {...rest} />;
}
