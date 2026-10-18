/**
 * Module plans (Settings, administrator only) and the administrator gate of the Settings page.
 * Firestore is never touched; the tests never contain the administrator password (unlocking is simulated).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/app/AuthProvider';
import DashboardPage from '@/app/DashboardPage';
import { NavMenu } from '@/app/ModuleLayout';
import { AppRoutes } from '@/app/routes';
import { ADMIN_ACCOUNT, isAdminUnlocked, lockAdmin, setClientLogin, verifyAdmin } from '@/core/admin';
import { SESSION_KEYS, USER_B64 } from '@/core/auth';
import { normalizeBusiness, setBusinessForTests, validateBusiness } from '@/core/business';
import { db } from '@/core/db';
import { MODULE_PLANS, moduleInPlan, moduleOfPath } from '@/core/modules';
import SettingsPage from '@/features/settings/SettingsPage';
import { FeedbackProvider } from '@/ui/Feedback';

vi.mock('@/app/pwa', () => ({
  OfflineBanner: () => null,
  InstallButton: () => null,
  useInstallPrompt: () => ({ showIosHint: false }),
}));

const unlockAdminForTest = () =>
  window.sessionStorage.setItem('admin_unlocked_until', String(Date.now() + 10 * 60_000));

const wrap = (ui, path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <FeedbackProvider>{ui}</FeedbackProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

function stubSettingsDb(stored = { name: 'Ganesh Textiles' }) {
  vi.spyOn(db, 'init').mockResolvedValue({});
  vi.spyOn(db, 'getBusinessSettings').mockResolvedValue(stored);
  const save = vi.spyOn(db, 'saveBusinessSettings').mockResolvedValue();
  vi.spyOn(db, 'getLoginSettings').mockResolvedValue(null);
  vi.spyOn(db, 'saveLoginSettings').mockResolvedValue();
  return save;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.localStorage.setItem(SESSION_KEYS.auth, 'true');
  window.localStorage.setItem(SESSION_KEYS.username, atob(USER_B64));
  window.localStorage.setItem(SESSION_KEYS.loginTime, new Date().toISOString());
  setBusinessForTests({ name: 'Ganesh Textiles', modulePlan: 'all' });
});
afterEach(() => {
  vi.restoreAllMocks();
  lockAdmin();
});

/** Titles of the menu's module groups (their open / close buttons). */
const menuGroups = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.hasAttribute('aria-expanded'))
    .map((b) => b.textContent.trim());

describe('module plans', () => {
  test('the three options and their modules', () => {
    expect(MODULE_PLANS.map((p) => [p.id, p.modules])).toEqual([
      ['basic', ['purchase', 'sales', 'overview', 'settings']],
      ['processing', ['purchase', 'processing', 'sales', 'overview', 'settings']],
      ['all', ['purchase', 'processing', 'sales', 'finance', 'overview', 'settings']],
    ]);
    expect(moduleInPlan('finance', 'basic')).toBe(false);
    expect(moduleInPlan('processing', 'processing')).toBe(true);
    expect(moduleInPlan('dashboard', 'basic')).toBe(true);
    expect(moduleOfPath('/finance/accounts')).toBe('finance');
    expect(moduleOfPath('/dyeing/details')).toBe('processing');
    expect(moduleOfPath('/')).toBe('dashboard');
  });

  test('an installation from before plans has every module; an unknown plan is refused', () => {
    expect(normalizeBusiness({ name: 'X' }).modulePlan).toBe('all');
    expect(normalizeBusiness({ name: 'X', modulePlan: 'weird' }).modulePlan).toBe('all');
    expect(validateBusiness({ name: 'X', modulePlan: 'weird' })).toHaveProperty('modulePlan');
  });

  test.each([
    ['basic', ['Purchase', 'Sales', 'Overview', 'Settings'], ['Dyeing & Combing', 'Finance']],
    ['processing', ['Purchase', 'Dyeing & Combing', 'Sales', 'Overview', 'Settings'], ['Finance']],
    ['all', ['Purchase', 'Dyeing & Combing', 'Sales', 'Finance', 'Overview', 'Settings'], []],
  ])('menu for plan %s', (plan, shown, hidden) => {
    setBusinessForTests({ name: 'Ganesh Textiles', modulePlan: plan });
    render(
      <MemoryRouter initialEntries={['/sales/bill']}>
        <NavMenu />
      </MemoryRouter>,
    );
    const groups = menuGroups();
    expect(groups).toEqual(shown);
    hidden.forEach((h) => expect(groups).not.toContain(h));
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  test('the dashboard only offers the modules of the plan', () => {
    setBusinessForTests({ name: 'Ganesh Textiles', modulePlan: 'basic' });
    wrap(<DashboardPage />);
    const main = screen.getByRole('region', { name: 'Modules' });
    expect(within(main).queryByText('Dyeing & Combing')).toBeNull();
    expect(within(main).queryByText('Finance')).toBeNull();
    expect(within(main).getByText('Sales')).toBeInTheDocument();
    expect(within(main).getByText('Purchase')).toBeInTheDocument();
  });

  test.each([
    ['basic', '/finance/accounts', 'Finance'],
    ['basic', '/processing/lots', 'Dyeing & Combing'],
    ['basic', '/dyeing/details', 'Dyeing & Combing'],
    ['processing', '/finance/records', 'Finance'],
  ])('plan %s: typing %s shows "not part of your plan"', async (plan, path, title) => {
    setBusinessForTests({ name: 'Ganesh Textiles', modulePlan: plan });
    wrap(<AppRoutes />, path);
    expect(
      await screen.findByRole('heading', { name: `${title} is not part of your plan` }),
    ).toBeInTheDocument();
  });

  test('the administrator picks a plan on the Settings page and it is saved with the business details', async () => {
    const save = stubSettingsDb({ name: 'Ganesh Textiles', modulePlan: 'all' });
    unlockAdminForTest();
    wrap(<SettingsPage />, '/settings');
    const group = await screen.findByRole('radiogroup', { name: 'Module plan' });
    const options = within(group).getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(options[2]).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(group).getByRole('radio', { name: /Purchase, Sales & Overview/ }));
    expect(within(group).getByRole('radio', { name: /Purchase, Sales & Overview/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({ modulePlan: 'basic' });
  });
});

describe('Settings is for the administrator only', () => {
  test('without the administrator sign-in the client sees only the sign-in card', async () => {
    stubSettingsDb();
    wrap(<AppRoutes />, '/settings');
    expect(await screen.findByRole('region', { name: 'Administrator sign-in' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Business name/)).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Module plan' })).toBeNull();
  });

  test('a wrong administrator login is refused', async () => {
    stubSettingsDb();
    wrap(<AppRoutes />, '/settings');
    const card = await screen.findByRole('region', { name: 'Administrator sign-in' });
    fireEvent.change(within(card).getByLabelText('Administrator username'), {
      target: { value: ADMIN_ACCOUNT.username },
    });
    fireEvent.change(within(card).getByLabelText('Administrator password'), { target: { value: 'wrong' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Unlock Settings' }));
    expect(
      await within(card).findByText('Wrong administrator username or password.', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(isAdminUnlocked()).toBe(false);
    expect(await verifyAdmin('someone', 'anything')).toBe(false);
  });

  test('signed in: the settings show; "Lock Settings" locks them again', async () => {
    stubSettingsDb();
    unlockAdminForTest();
    wrap(<AppRoutes />, '/settings');
    expect(await screen.findByLabelText(/^Business name/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lock Settings' }));
    expect(await screen.findByRole('region', { name: 'Administrator sign-in' })).toBeInTheDocument();
  });

  test('the client login cannot be changed without the administrator', async () => {
    await expect(
      setClientLogin({ username: 'ganesh', password: 'secret123', confirmPassword: 'secret123' }),
    ).rejects.toThrow(/administrator/);
  });

  test('logging out ends the administrator access', async () => {
    unlockAdminForTest();
    let auth;
    function Probe() {
      auth = useAuth();
      return null;
    }
    wrap(<Probe />);
    expect(isAdminUnlocked()).toBe(true);
    await act(() => auth.logout());
    expect(isAdminUnlocked()).toBe(false);
  });
});
