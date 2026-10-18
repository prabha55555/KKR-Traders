import { useSyncExternalStore } from 'react';

/** Same tiers as the mobile port and Tailwind's md / lg: compact < 640 (phone) · medium < 1024 (tablet) · expanded >= 1024. */
export const BREAKPOINTS = { medium: 640, expanded: 1024 };

const subscribe = (cb) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
const getWidth = () => window.innerWidth;

export function useBreakpoint() {
  const width = useSyncExternalStore(subscribe, getWidth, () => 1280);
  const isCompact = width < BREAKPOINTS.medium;
  const isExpanded = width >= BREAKPOINTS.expanded;
  const isMedium = !isCompact && !isExpanded;
  const tier = isCompact ? 'compact' : isMedium ? 'medium' : 'expanded';
  /** pick({ compact: 1, medium: 2, expanded: 3 }) — falls back to the next smaller tier */
  const pick = (values) =>
    values[tier] ?? (tier === 'expanded' ? (values.medium ?? values.compact) : values.compact);
  return { width, tier, isCompact, isMedium, isExpanded, pick };
}
