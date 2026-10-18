/**
 * Business settings (Settings page): the business using the app is configured in its own database, never in the code;
 * Brightlight Solutions stays the maker everywhere. Also the per-customer Firebase project and the business's own login.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CREDIT_LINE, VENDOR } from '@/core/branding';
import {
  BUNDLED_LOGO,
  DEFAULT_BUSINESS,
  bankLines,
  getBusiness,
  isBusinessConfigured,
  legacyDetails,
  monogramOf,
  normalizeBusiness,
  printName,
  purchaseAckLine,
  saveBusiness,
  setBusinessForTests,
  validateBusiness,
} from '@/core/business';
import { changeLogin, hashPassword, makeLoginRecord, verifyLogin, PASS_B64, USER_B64 } from '@/core/auth';
import { db } from '@/core/db';
import { resolveFirebaseConfig } from '@/core/firebase';
import { buildInvoiceHtml } from '@/core/services/invoiceHtml';
import { buildAcknowledgementMessage } from '@/core/services/purchaseBill';

const GANESH = {
  name: 'Ganesh Textiles',
  tagline: 'Quality since 1990',
  address: '12, Market Road, Erode',
  phones: '98400 11111',
  gstin: '33ABCDE1234F1Z5',
  salesBillTitle: 'TAX INVOICE',
  paymentNo: '98400 11111',
  bankName: 'SBI',
  bankAccountNo: '123456789',
  bankIfsc: 'SBIN0001234',
  upiId: 'ganesh@sbi',
  billTerms: 'Goods once sold cannot be taken back\nSubject to Erode jurisdiction',
};
const legacy = () => normalizeBusiness(legacyDetails('sriram-96e71'));

beforeEach(() => setBusinessForTests(legacy(), true));
afterEach(() => vi.restoreAllMocks());

describe('business details', () => {
  test('the original installation keeps the details it always printed until Settings are saved', () => {
    expect(legacyDetails('sriram-96e71')).toMatchObject({
      name: 'Santhamani Textiles',
      logo: BUNDLED_LOGO,
      monogram: 'SS',
    });
    expect(printName(legacy())).toBe('SANTHAMANI TEXTILES');
    // a new customer's database starts blank (no Santhamani details leak into it)
    expect(legacyDetails('ganesh-textiles-billing')).toBeNull();
  });

  test('normalizing keeps known fields only, trimmed, on top of the defaults', () => {
    const v = normalizeBusiness({ name: '  Ganesh  ', unknown: 'x', phones: null });
    expect(v.name).toBe('Ganesh');
    expect(v).not.toHaveProperty('unknown');
    expect(v.salesBillTitle).toBe(DEFAULT_BUSINESS.salesBillTitle);
  });

  test('validation: name required; GST number, IFSC and e-mail checked', () => {
    expect(validateBusiness({ name: '' })).toHaveProperty('name');
    expect(validateBusiness({ name: 'A', gstin: '33ABC' })).toHaveProperty('gstin');
    expect(validateBusiness({ name: 'A', bankIfsc: 'SBI123' })).toHaveProperty('bankIfsc');
    expect(validateBusiness({ name: 'A', email: 'nope' })).toHaveProperty('email');
    expect(validateBusiness(GANESH)).toEqual({});
  });

  test('saving stores the details in the business’s own settings document and uses them everywhere at once', async () => {
    const save = vi.spyOn(db, 'saveBusinessSettings').mockResolvedValue();
    setBusinessForTests({}, false);
    expect(isBusinessConfigured()).toBe(true); // the test database is the original installation
    await saveBusiness({ ...GANESH, gstin: '33abcde1234f1z5' });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ganesh Textiles', gstin: '33ABCDE1234F1Z5' }),
    );
    expect(getBusiness().name).toBe('Ganesh Textiles');
    await expect(saveBusiness({ name: '' })).rejects.toThrow(/business name/);
  });

  test('derived values: initials, bank lines, acknowledgement line', () => {
    const g = normalizeBusiness(GANESH);
    expect(monogramOf(g)).toBe('GT');
    expect(bankLines(g)).toEqual(['Bank: SBI', 'A/c No: 123456789', 'IFSC: SBIN0001234', 'UPI: ganesh@sbi']);
    expect(purchaseAckLine(g)).toBe('Ganesh Textiles has received the products mentioned above. Thank you.');
    expect(purchaseAckLine({ ...g, purchaseAckMessage: 'Goods received, thanks!' })).toBe(
      'Goods received, thanks!',
    );
  });
});

describe('bills and messages use the business from Settings; Brightlight stays the maker', () => {
  const invoice = {
    invoiceNo: '007',
    invoiceDate: '2026-10-19',
    customerName: 'Ravi',
    products: [{ description: 'Cotton', qty: 1, rate: 100, amount: 100 }],
    subtotal: 100,
    grandTotal: 100,
    amountPaid: 0,
    balanceDue: 100,
  };
  test('the printed bill shows the configured business, GST number, bill heading, bank details and terms', () => {
    setBusinessForTests(GANESH);
    const html = buildInvoiceHtml({ invoice });
    expect(html).toContain('GANESH TEXTILES');
    expect(html).toContain('GSTIN: 33ABCDE1234F1Z5');
    expect(html).toContain('TAX INVOICE');
    expect(html).toContain('IFSC: SBIN0001234');
    expect(html).toContain('Subject to Erode jurisdiction');
    expect(html).toContain('For GANESH TEXTILES');
    expect(html).toContain('GT 007'); // watermark initials
    expect(html).not.toContain('SANTHAMANI');
    expect(html).toContain(`Software created by ${VENDOR.creditName}`);
  });
  test('a business name with HTML characters is printed safely', () => {
    setBusinessForTests({ ...GANESH, name: 'A & B <Textiles>' });
    expect(buildInvoiceHtml({ invoice })).toContain('A &amp; B &lt;TEXTILES&gt;');
  });
  test('the purchase acknowledgement closes with the business line and the Brightlight credit', async () => {
    setBusinessForTests(GANESH);
    const msg = await buildAcknowledgementMessage({
      supplierName: 'Sri Yarns',
      invoiceNo: '',
      invoiceDate: '2026-10-19',
      rows: [{ description: 'Yarn', qty: '1', rate: '10' }],
      previousBalance: 0,
      manualPreviousBalance: '0',
      discountAmount: '0',
      cash: '0',
      account: '0',
    });
    expect(msg).toContain('Ganesh Textiles has received the products mentioned above. Thank you.');
    expect(msg).toContain(CREDIT_LINE);
  });
});

describe('each customer has its own Firebase project', () => {
  test('no env settings: the original installation', () => {
    expect(resolveFirebaseConfig({}).projectId).toBe('sriram-96e71');
  });
  test('a customer env file: that customer’s project', () => {
    const cfg = resolveFirebaseConfig({
      VITE_FIREBASE_API_KEY: 'key',
      VITE_FIREBASE_AUTH_DOMAIN: 'ganesh.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'ganesh',
      VITE_FIREBASE_APP_ID: '1:2:web:3',
    });
    expect(cfg).toMatchObject({ projectId: 'ganesh', apiKey: 'key' });
  });
  test('a half-filled env file stops the app instead of mixing two projects', () => {
    expect(() => resolveFirebaseConfig({ VITE_FIREBASE_PROJECT_ID: 'ganesh' })).toThrow(
      /VITE_FIREBASE_API_KEY/,
    );
  });
});

describe('the business’s own login', () => {
  test('the stored login is a salted hash, never the password', async () => {
    const record = await makeLoginRecord('ganesh', 'secret123');
    expect(record.username).toBe('ganesh');
    expect(JSON.stringify(record)).not.toContain('secret123');
    expect(await hashPassword('secret123', record.salt, record.iterations)).toBe(record.passwordHash);
    expect(await verifyLogin('ganesh', 'secret123', record)).toBe(true);
    expect(await verifyLogin('ganesh', 'wrong', record)).toBe(false);
    expect(await verifyLogin(atob(USER_B64), atob(PASS_B64), record)).toBe(false); // the default login no longer opens it
  });
  test('without a stored login the default login works', async () => {
    expect(await verifyLogin(atob(USER_B64), atob(PASS_B64), null)).toBe(true);
  });
  test('changing the login needs the current password and stores only the hash', async () => {
    vi.spyOn(db, 'init').mockResolvedValue();
    vi.spyOn(db, 'getLoginSettings').mockResolvedValue(null);
    const save = vi.spyOn(db, 'saveLoginSettings').mockResolvedValue();
    await expect(
      changeLogin({
        currentUsername: atob(USER_B64),
        currentPassword: 'wrong',
        username: 'ganesh',
        password: 'secret123',
        confirmPassword: 'secret123',
      }),
    ).rejects.toThrow(/current password/);
    const user = await changeLogin({
      currentUsername: atob(USER_B64),
      currentPassword: atob(PASS_B64),
      username: 'ganesh',
      password: 'secret123',
      confirmPassword: 'secret123',
    });
    expect(user).toBe('ganesh');
    const stored = save.mock.calls[0][0];
    expect(stored).toMatchObject({ username: 'ganesh' });
    expect(stored.passwordHash).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain('secret123');
  });
});

describe('changing the login after it was renamed on another device', () => {
  test('the current password is checked against the login as stored now', async () => {
    const renamed = await makeLoginRecord('ganesh2', 'secret123');
    vi.spyOn(db, 'init').mockResolvedValue();
    vi.spyOn(db, 'getLoginSettings').mockResolvedValue(renamed);
    const save = vi.spyOn(db, 'saveLoginSettings').mockResolvedValue();
    // this device still has the old username in its session
    const user = await changeLogin({
      currentUsername: 'ganesh',
      currentPassword: 'secret123',
      username: 'ganesh3',
      password: 'newpass1',
      confirmPassword: 'newpass1',
    });
    expect(user).toBe('ganesh3');
    expect(save).toHaveBeenCalled();
  });
});
