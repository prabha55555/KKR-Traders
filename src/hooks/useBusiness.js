import { useSyncExternalStore } from 'react';
import { getBusiness, subscribeBusiness } from '@/core/business';

/** The business details from the Settings page (re-renders when they are saved or loaded). */
export function useBusiness() {
  return useSyncExternalStore(subscribeBusiness, getBusiness, getBusiness);
}
