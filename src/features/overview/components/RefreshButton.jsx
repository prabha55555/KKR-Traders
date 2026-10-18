import { RefreshButton as UiRefreshButton } from '@/ui';

/** Page-header refresh action (drops the in-memory cache, see useFocusLoad().refresh) — the shared app-wide Refresh button. */
export default function RefreshButton({ onClick, refreshing }) {
  return <UiRefreshButton onClick={onClick} loading={refreshing} />;
}
