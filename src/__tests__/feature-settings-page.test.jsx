/**
 * Settings page: the business's own details (printed on bills, statements, DCs and messages) and the app login.
 * Firestore is never touched: the settings documents are stubbed on `db`.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { AuthProvider } from '@/app/AuthProvider';
import { NAV_CATEGORIES, NavMenu } from '@/app/ModuleLayout';
import { AppRoutes } from '@/app/routes';
import { PASS_B64, SESSION_KEYS, USER_B64 } from '@/core/auth';
import { VENDOR } from '@/core/branding';
import { getBusiness } from '@/core/business';
import { db } from '@/core/db';
import { AdminGate } from '@/features/settings/AdminGate';
import SettingsPage from '@/features/settings/SettingsPage';
import { fitWithin, resizeLogo } from '@/features/settings/logoImage';
import { FeedbackProvider } from '@/ui/Feedback';

// the PWA helpers import a Vite virtual module that only exists in the app build
vi.mock('@/app/pwa', () => ({ OfflineBanner: () => null }));
// a new installation: no details built in for this database, so "not set up yet" can be seen
vi.mock('@/core/firebase', async (importOriginal) => ({
  ...(await importOriginal()),
  firebaseConfig: { projectId: 'settings-page-test' },
}));

const USER = atob(USER_B64);
const PASS = atob(PASS_B64);
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
const STORED = {
  name: 'Ganesh Textiles',
  tagline: 'Quality since 1990',
  address: '12, Market Road, Erode',
  phones: '98400 11111',
  gstin: '33ABCDE1234F1Z5',
  salesBillTitle: 'TAX INVOICE',
  logo: LOGO,
  billTerms: 'Goods once sold cannot be taken back\nSubject to Erode jurisdiction',
};

function stubDb(stored = STORED) {
  vi.spyOn(db, 'init').mockResolvedValue({});
  vi.spyOn(db, 'getBusinessSettings').mockResolvedValue(stored);
  const saveBusiness = vi.spyOn(db, 'saveBusinessSettings').mockResolvedValue();
  vi.spyOn(db, 'getLoginSettings').mockResolvedValue(null);
  const saveLogin = vi.spyOn(db, 'saveLoginSettings').mockResolvedValue();
  return { saveBusiness, saveLogin };
}
const wrap = (ui, path = '/settings') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <FeedbackProvider>{ui}</FeedbackProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
const renderPage = () => wrap(<SettingsPage />);
/** HTML of the printed-bill preview (an iframe). */
const billPreview = () => screen.getByTitle('Sales bill preview').getAttribute('srcdoc');
const nameField = () => screen.findByLabelText(/^Business name/);
const saveButton = () => screen.getByRole('button', { name: 'Save settings' });

/** The administrator's unlock, as core/admin.js stores it (the tests never contain the administrator password). */
const unlockAdminForTest = () =>
  window.sessionStorage.setItem('admin_unlocked_until', String(Date.now() + 10 * 60_000));

beforeEach(() => {
  window.sessionStorage.clear();
  unlockAdminForTest();
  window.localStorage.clear();
  // signed in with the default login
  window.localStorage.setItem(SESSION_KEYS.auth, 'true');
  window.localStorage.setItem(SESSION_KEYS.username, USER);
  window.localStorage.setItem(SESSION_KEYS.loginTime, new Date().toISOString());
});
afterEach(() => vi.restoreAllMocks());

describe('Settings page — business details', () => {
  test('the form opens with the details stored in the database', async () => {
    stubDb();
    renderPage();
    expect(screen.getByText('Loading your business details…')).toBeInTheDocument();
    expect(await nameField()).toHaveValue('Ganesh Textiles');
    expect(db.getBusinessSettings).toHaveBeenCalled();
    expect(screen.getByLabelText('Tagline')).toHaveValue('Quality since 1990');
    expect(screen.getByLabelText('Address')).toHaveValue('12, Market Road, Erode');
    expect(screen.getByLabelText('GST number')).toHaveValue('33ABCDE1234F1Z5');
    expect(screen.getByLabelText('Bill heading')).toHaveValue('TAX INVOICE');
    expect(screen.getByRole('radio', { name: 'TAX INVOICE' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByAltText('Logo preview')).toHaveAttribute('src', LOGO);
    // blank fields show what is used instead
    expect(screen.getByLabelText('Watermark initials')).toHaveAttribute('placeholder', 'GT');
    expect(screen.getByLabelText('Welcome heading')).toHaveAttribute(
      'placeholder',
      'Welcome to Ganesh Textiles',
    );
    expect(screen.getByLabelText('Greeting name')).toHaveAttribute('placeholder', USER);
    expect(screen.getByLabelText('Phone numbers in messages')).toHaveAttribute('placeholder', '98400 11111');
    expect(screen.getByLabelText('Acknowledgement closing line')).toHaveAttribute(
      'placeholder',
      'Ganesh Textiles has received the products mentioned above. Thank you.',
    );
    // already set up: no first-time notice, nothing unsaved
    expect(screen.queryByText(/Fill in your business details/)).toBeNull();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByText(`Powered by ${VENDOR.name}`)).toBeInTheDocument();
  });

  test('editing the name updates the preview; Save stores the normalized details once', async () => {
    const { saveBusiness } = stubDb();
    let release;
    saveBusiness.mockImplementation(() => new Promise((r) => (release = r)));
    renderPage();
    // the preview is the REAL printed bill (same builder as printing), rendered in a frame
    const bill = () => billPreview();
    fireEvent.change(await nameField(), { target: { value: '  Sri Murugan Tex  ' } });
    expect(bill()).toContain('SRI MURUGAN TEX');
    expect(bill()).toContain('GSTIN: 33ABCDE1234F1Z5');
    expect(bill()).toContain('Subject to Erode jurisdiction');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByLabelText('Watermark initials')).toHaveAttribute('placeholder', 'SMT');

    // capitals as typed; bank details reach the preview
    fireEvent.change(screen.getByLabelText('IFSC'), { target: { value: 'sbin0001234' } });
    expect(screen.getByLabelText('IFSC')).toHaveValue('SBIN0001234');
    fireEvent.click(screen.getByRole('radio', { name: 'CASH BILL' }));
    expect(bill()).toContain('CASH BILL');
    expect(bill()).toContain('IFSC: SBIN0001234');

    // a double tap saves once
    fireEvent.click(saveButton());
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveBusiness).toHaveBeenCalledTimes(1));
    expect(saveButton()).toBeDisabled();
    release();
    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    expect(saveBusiness).toHaveBeenCalledTimes(1);
    expect(saveBusiness.mock.calls[0][0]).toMatchObject({
      name: 'Sri Murugan Tex',
      bankIfsc: 'SBIN0001234',
      salesBillTitle: 'CASH BILL',
      gstin: '33ABCDE1234F1Z5',
      logo: LOGO,
    });
    expect(await nameField()).toHaveValue('Sri Murugan Tex');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(getBusiness().name).toBe('Sri Murugan Tex');
  });

  test('an invalid GST number is shown under the field and nothing is saved', async () => {
    const { saveBusiness } = stubDb();
    renderPage();
    await nameField();
    const gst = screen.getByLabelText('GST number');
    fireEvent.change(gst, { target: { value: '33abc' } });
    expect(gst).toHaveValue('33ABC');
    fireEvent.click(saveButton());
    // under the field and as a toast
    await waitFor(() => expect(screen.getAllByText(/GST number should be 15 characters/)).toHaveLength(2));
    expect(screen.getByText('Settings not saved')).toBeInTheDocument();
    expect(gst).toHaveFocus();
    expect(saveBusiness).not.toHaveBeenCalled();
    // fixing the field clears its error
    fireEvent.change(gst, { target: { value: '33ABCDE1234F1Z5' } });
    expect(screen.getAllByText(/GST number should be 15 characters/)).toHaveLength(1); // the toast only
  });

  test('removing the logo saves an empty logo', async () => {
    const { saveBusiness } = stubDb();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove logo' }));
    expect(screen.queryByAltText('Logo preview')).toBeNull();
    expect(screen.getByText('No logo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload logo' })).toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveBusiness).toHaveBeenCalledTimes(1));
    expect(saveBusiness.mock.calls[0][0]).toMatchObject({ logo: '' });
  });

  test('no logo is built into the app: a stored "bundled" value (old installations) is simply no logo', async () => {
    stubDb({ ...STORED, logo: 'bundled' });
    renderPage();
    expect(await screen.findByText('No logo')).toBeInTheDocument();
    expect(screen.queryByText('Default logo')).toBeNull();
    expect(screen.queryByAltText('Logo preview')).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload logo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove logo' })).toBeNull();
  });

  test('the logo label is tied to its field and the hint is described', async () => {
    stubDb();
    renderPage();
    const picker = await screen.findByLabelText('Logo picture');
    expect(picker).toHaveAttribute('id', 'business-logo-file');
    expect(document.querySelector('label[for="business-logo-file"]')).not.toBeNull();
    expect(document.getElementById(picker.getAttribute('aria-describedby'))).toHaveTextContent(
      /Printed at the top of every bill/,
    );
  });

  test('Reset goes back to the saved details', async () => {
    const { saveBusiness } = stubDb();
    renderPage();
    const reset = () => screen.getByRole('button', { name: 'Reset' });
    fireEvent.change(await nameField(), { target: { value: 'Something Else' } });
    fireEvent.change(screen.getByLabelText('Phone numbers'), { target: { value: '90000 00000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(reset());
    expect(await nameField()).toHaveValue('Ganesh Textiles');
    expect(screen.getByLabelText('Phone numbers')).toHaveValue('98400 11111');
    expect(screen.getByAltText('Logo preview')).toHaveAttribute('src', LOGO);
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(reset()).toBeDisabled();
    expect(saveBusiness).not.toHaveBeenCalled();
  });

  test('a new installation shows the set-up notice and needs a business name', async () => {
    const { saveBusiness } = stubDb(null);
    renderPage();
    expect(
      await screen.findByText(
        'Fill in your business details and press Save — they will appear on every bill.',
      ),
    ).toBeInTheDocument();
    expect(await nameField()).toHaveValue('');
    expect(billPreview()).toContain('YOUR BUSINESS NAME');
    fireEvent.click(saveButton());
    expect((await screen.findAllByText('Please enter the business name.')).length).toBeGreaterThan(0);
    expect(saveBusiness).not.toHaveBeenCalled();
  });

  test('when the database cannot be read the copy on this device is shown', async () => {
    stubDb();
    db.getBusinessSettings.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderPage();
    // the form still opens (with whatever this device has)
    expect(await nameField()).toBeInTheDocument();
  });
});

describe('Settings page — client login (administrator)', () => {
  test('the administrator sets the client login without the current password; only a salted hash is stored', async () => {
    const { saveLogin } = stubDb();
    renderPage();
    const card = await screen.findByRole('region', { name: 'Client login' });
    expect(within(card).getByText(`Signed in as ${USER}`)).toBeInTheDocument();
    expect(within(card).getByText(/uses the default login it was installed with/)).toBeInTheDocument();
    expect(within(card).queryByLabelText('Current password')).toBeNull();
    const field = (label) => within(card).getByLabelText(label);
    expect(field('New username')).toHaveValue(USER);

    fireEvent.change(field('New username'), { target: { value: 'ganesh' } });
    fireEvent.change(field('New password'), { target: { value: 'secret123' } });
    fireEvent.change(field('Confirm new password'), { target: { value: 'secret123' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save client login' }));
    await waitFor(() => expect(saveLogin).toHaveBeenCalledTimes(1));
    const stored = saveLogin.mock.calls[0][0];
    expect(stored).toMatchObject({ username: 'ganesh' });
    expect(stored.passwordHash).toEqual(expect.any(String));
    expect(stored.salt).toEqual(expect.any(String));
    expect(JSON.stringify(stored)).not.toContain('secret123');

    expect(await screen.findByText('Client login changed')).toBeInTheDocument();
    // the session carries on under the new username; the password boxes are emptied
    expect(within(card).getByText('Signed in as ganesh')).toBeInTheDocument();
    expect(window.localStorage.getItem(SESSION_KEYS.username)).toBe('ganesh');
    expect(field('New password')).toHaveValue('');
    expect(field('Confirm new password')).toHaveValue('');
  });

  test('new passwords that do not match are refused', async () => {
    const { saveLogin } = stubDb();
    renderPage();
    const card = await screen.findByRole('region', { name: 'Client login' });
    fireEvent.change(within(card).getByLabelText('New password'), { target: { value: 'secret123' } });
    fireEvent.change(within(card).getByLabelText('Confirm new password'), {
      target: { value: 'secret124' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Save client login' }));
    expect(await within(card).findByText('The two new passwords do not match.')).toBeInTheDocument();
    expect(saveLogin).not.toHaveBeenCalled();
  });
});

describe('Settings in the menu and the routes', () => {
  test('"Settings" is the last menu group, with "Business Settings" → /settings', () => {
    const settings = NAV_CATEGORIES.at(-1);
    expect(settings).toMatchObject({ id: 'settings', title: 'Settings', basePath: '/settings' });
    expect(settings.items).toEqual([
      expect.objectContaining({ to: '/settings', label: 'Business Settings' }),
    ]);
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <NavMenu />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Business Settings' })).toHaveAttribute('href', '/settings');
  });

  test('/settings opens the Settings page inside the app shell (administrator signed in)', async () => {
    stubDb();
    unlockAdminForTest();
    wrap(<AppRoutes />);
    expect(await nameField()).toHaveValue('Ganesh Textiles');
    expect(screen.getAllByRole('heading', { level: 1, name: 'Settings' }).length).toBeGreaterThan(0);
  });
});

describe('logo picture', () => {
  test('is shrunk to 400 px on its longest side, never enlarged', () => {
    expect(fitWithin(1600, 800)).toEqual({ width: 400, height: 200 });
    expect(fitWithin(500, 1000)).toEqual({ width: 200, height: 400 });
    expect(fitWithin(300, 120)).toEqual({ width: 300, height: 120 });
    expect(fitWithin(0, 0)).toEqual({ width: 400, height: 400 });
  });
  test('only image files are accepted', async () => {
    await expect(resizeLogo(new File(['x'], 'notes.txt', { type: 'text/plain' }))).rejects.toThrow(
      /image file/,
    );
  });
});

describe('Settings page — unsaved edits and the full-size preview', () => {
  test('unsaved edits: the browser is asked before the tab closes; Lock Settings asks before discarding', async () => {
    stubDb();
    wrap(
      <AdminGate>
        <SettingsPage />
      </AdminGate>,
    );
    fireEvent.change(await nameField(), { target: { value: 'Something Else' } });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Lock Settings' }));
    expect(
      await screen.findByText(/unsaved changes. Locking Settings will discard them/),
    ).toBeInTheDocument();
    // "keep editing" leaves it unlocked
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByText(/Locking Settings will discard/)).toBeNull());
    expect(window.sessionStorage.getItem('admin_unlocked_until')).not.toBeNull();
    // a clean form does not block the tab closing
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });

  test('"Full-size preview" opens the bill in a dialog', async () => {
    stubDb();
    renderPage();
    await nameField();
    fireEvent.click(screen.getByRole('button', { name: 'Full-size preview' }));
    expect(await screen.findByTitle('Sales bill full-size preview')).toBeInTheDocument();
  });
});
