/**
 * Module plans: which parts of the app a client has. Chosen by the administrator on the Settings page and stored with
 * the client's business settings (`settings/business.modulePlan`), so every client can have a different plan.
 * Modules outside the plan are hidden from the menu and the dashboard, and their addresses show "not available".
 * Their data is never touched — switching back to a larger plan shows everything again.
 */
export const MODULE_PLANS = [
  {
    id: 'basic',
    title: 'Purchase, Sales & Overview',
    modules: ['purchase', 'sales', 'overview', 'settings'],
  },
  {
    id: 'processing',
    title: 'Purchase, Dyeing & Combing, Sales & Overview',
    modules: ['purchase', 'processing', 'sales', 'overview', 'settings'],
  },
  {
    id: 'all',
    title: 'All Modules (with Finance)',
    modules: ['purchase', 'processing', 'sales', 'finance', 'overview', 'settings'],
  },
];

/** Installations from before plans existed have every module. */
export const DEFAULT_MODULE_PLAN = 'all';

/** Display names of the modules (for the plan picker and the "not available" page). */
export const MODULE_TITLES = {
  purchase: 'Purchase',
  processing: 'Dyeing & Combing',
  sales: 'Sales',
  finance: 'Finance',
  overview: 'Overview',
  settings: 'Settings',
};

export const isModulePlan = (id) => MODULE_PLANS.some((p) => p.id === id);

/** The plan with this id (an unknown / missing id = the default plan). */
export function modulePlan(id) {
  return MODULE_PLANS.find((p) => p.id === id) ?? MODULE_PLANS.find((p) => p.id === DEFAULT_MODULE_PLAN);
}

/** Is this module part of the plan? The dashboard is always available. */
export function moduleInPlan(moduleId, planId) {
  if (!moduleId || moduleId === 'dashboard') return true;
  return modulePlan(planId).modules.includes(moduleId);
}

/** The module an app address belongs to ('/finance/accounts' → 'finance'; '/' → 'dashboard'). */
export function moduleOfPath(path) {
  const first = String(path ?? '')
    .replace(/^\/+/, '')
    .split(/[/?#]/)[0];
  if (!first) return 'dashboard';
  // old Dyeing / Combing addresses redirect into Dyeing & Combing
  if (first === 'dyeing' || first === 'combing') return 'processing';
  return first;
}
