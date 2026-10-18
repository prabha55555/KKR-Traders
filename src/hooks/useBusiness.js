import { useSyncExternalStore } from 'react';
import { getBusiness, isModuleEnabled, subscribeBusiness } from '@/core/business';

/** The business details from the Settings page (re-renders when they are saved or loaded). */
export function useBusiness() {
  return useSyncExternalStore(subscribeBusiness, getBusiness, getBusiness);
}

/** `enabled('finance')` → is that module in the client's plan (re-renders when the plan changes). */
export function useModules() {
  const business = useBusiness();
  return (moduleId) => isModuleEnabled(moduleId, business);
}
