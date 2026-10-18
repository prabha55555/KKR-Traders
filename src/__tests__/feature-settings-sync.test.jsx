/**
 * Business details stay correct and in step everywhere: the Settings page never saves from a copy it could not verify,
 * the preview shows every place the details appear, and screens follow a change at once. Firestore is stubbed.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthProvider } from '@/app/AuthProvider';
import DashboardPage from '@/app/DashboardPage';
import { SESSION_KEYS, USER_B64 } from '@/core/auth';
import { setBusinessForTests } from '@/core/business';
import { db } from '@/core/db';
import SettingsPage from '@/features/settings/SettingsPage';
import { FeedbackProvider } from '@/ui/Feedback';

vi.mock('@/app/pwa', () => ({
  OfflineBanner: () => null,
  InstallButton: () => null,
  useInstallPrompt: () => ({ showIosHint: false }),
}));

const STORED = {
  name: 'Ganesh Textiles',
  ownerName: 'Ganesh',
  tagline: 'Quality since 1990',
  phones: '98400 11111',
  shareLocation: 'Erode',
  purchaseAckMessage: 'Goods received in good condition.',
};

const wrap = (ui) =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <FeedbackProvider>{ui}</FeedbackProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  window.sessionStorage.setItem('admin_unlocked_until', String(Date.now() + 10 * 60_000));
  window.localStorage.setItem(SESSION_KEYS.auth, 'true');
  window.localStorage.setItem(SESSION_KEYS.username, atob(USER_B64));
  window.localStorage.setItem(SESSION_KEYS.loginTime, new Date().toISOString());
  vi.spyOn(db, 'init').mockResolvedValue({});
  vi.spyOn(db, 'getLoginSettings').mockResolvedValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe('the Settings page never saves details it could not load', () => {
  test('a failed read: warning, Save blocked; "Try again" loads the saved details and allows saving', async () => {
    // this device still has an old copy
    setBusinessForTests({ name: 'Old Name On This Device' }, true, 'device');
    const read = vi.spyOn(db, 'getBusinessSettings').mockRejectedValueOnce(new Error('offline'));
    const save = vi.spyOn(db, 'saveBusinessSettings').mockResolvedValue();
    wrap(<SettingsPage />);
    expect(await screen.findByText(/saved settings could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();

    read.mockResolvedValue(STORED);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByDisplayValue('Ganesh Textiles')).toBeInTheDocument();
    expect(screen.queryByText(/saved settings could not be loaded/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save settings' })).not.toBeDisabled();
  });

  test('the form always opens with what is saved in the database, not the copy on this device', async () => {
    setBusinessForTests({ name: 'Old Name On This Device' }, true, 'device');
    vi.spyOn(db, 'getBusinessSettings').mockResolvedValue(STORED);
    wrap(<SettingsPage />);
    expect(await screen.findByDisplayValue('Ganesh Textiles')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Old Name On This Device')).toBeNull();
  });
});

describe('live preview', () => {
  test('dashboard and WhatsApp views show the typed details', async () => {
    vi.spyOn(db, 'getBusinessSettings').mockResolvedValue(STORED);
    wrap(<SettingsPage />);
    const preview = await screen.findByRole('region', { name: 'Bill preview' });
    expect(within(preview).getByTitle('Sales bill preview').getAttribute('srcdoc')).toContain(
      'GANESH TEXTILES',
    );

    fireEvent.click(within(preview).getByRole('radio', { name: 'Dashboard' }));
    expect(within(preview).getByText('Good morning, Ganesh')).toBeInTheDocument();
    expect(within(preview).getByText('Ganesh Textiles')).toBeInTheDocument();
    expect(within(preview).getByText('Quality since 1990')).toBeInTheDocument();
    expect(within(preview).getByText('Ganesh Textiles · Billing')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Business name/), { target: { value: 'Ganesh Silks' } });
    expect(within(preview).getByText('Ganesh Silks · Billing')).toBeInTheDocument();

    fireEvent.click(within(preview).getByRole('radio', { name: 'WhatsApp' }));
    expect(within(preview).getByText(/🏢 \*GANESH SILKS\*/)).toBeInTheDocument();
    expect(within(preview).getByText(/📍 Erode/)).toBeInTheDocument();
    expect(within(preview).getByText(/Goods received in good condition\./)).toBeInTheDocument();
  });
});

describe('screens follow a change at once', () => {
  test('the dashboard shows the new business name and welcome as soon as the details change', async () => {
    setBusinessForTests(STORED);
    wrap(<DashboardPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Ganesh Textiles');
    expect(screen.getByText(/Good morning|Good afternoon|Good evening/)).toHaveTextContent('Ganesh');
    act(() => setBusinessForTests({ ...STORED, name: 'Ganesh Silks', welcomeMessage: 'Vanakkam!' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vanakkam!'));
  });
});
