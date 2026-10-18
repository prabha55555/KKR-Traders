import { openInvoiceForEditing } from '@/features/salesBill/billLoader';
import {
  customerToPickOnEnter,
  findCustomerByPhone,
  previousBalanceFor,
  roundMoney,
  shouldLookupPhone,
  suggestCustomers,
} from '@/features/salesBill/customerLookup';
import { db } from '@/core/db';
afterEach(() => jest.restoreAllMocks());
const invoice = (no, over = {}) => ({
  invoiceNo: no,
  invoiceDate: '2026-10-03',
  customerName: 'SLN TEX',
  customerAddress: 'Tirupur',
  customerPhone: '9876543210',
  products: [{ sno: 1, description: 'Cotton Shirt', qty: 10, rate: 100, amount: 1000 }],
  subtotal: 1000,
  previousBalance: 0,
  grandTotal: 1000,
  amountPaid: 0,
  balanceDue: 1000,
  ...over,
});
function stubLedger(invoices) {
  jest.spyOn(db, 'getAllInvoices').mockResolvedValue(invoices);
  jest
    .spyOn(db, 'getInvoice')
    .mockImplementation(async (no) => invoices.find((i) => i.invoiceNo === no) ?? null);
  jest.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([]);
  jest.spyOn(db, 'getAllReturns').mockResolvedValue([]);
  jest.spyOn(db, 'getReturnsByInvoice').mockResolvedValue([]);
}
describe('openInvoiceForEditing', () => {
  test('returns null when the invoice does not exist', async () => {
    stubLedger([]);
    expect(await openInvoiceForEditing('999')).toBeNull();
  });
  test('opens a saved, edit-mode session; the first bill keeps its opening balance (rounded like the web text field)', async () => {
    stubLedger([invoice('012', { previousBalance: 100.456 })]);
    const s = await openInvoiceForEditing('012');
    expect(s).toMatchObject({ saved: true, editingNo: '012', persistedNo: '012' });
    expect(s?.form.previousBalance).toBe(100.46);
    expect(s?.form.customerName).toBe('SLN TEX');
  });
  test('an invoice without a stored previous balance gets it from the invoice before it', async () => {
    const stored = invoice('012');
    delete stored.previousBalance;
    stubLedger([invoice('011', { amountPaid: 750, balanceDue: 250 }), stored]);
    const s = await openInvoiceForEditing('012');
    expect(s?.form.previousBalance).toBe(250);
  });
  test('a stale stored previous balance is replaced by the ledger value (no manual re-save needed)', async () => {
    // 011 was paid in full after 012 had been written carrying 1000
    stubLedger([invoice('011', { amountPaid: 1000, balanceDue: 0 }), invoice('012', { previousBalance: 1000 })]);
    expect((await openInvoiceForEditing('012'))?.form.previousBalance).toBe(0);
  });
  test('when the ledger cannot be read the stored previous balance is kept', async () => {
    stubLedger([invoice('012', { previousBalance: 300 })]);
    jest.spyOn(db, 'getAllInvoices').mockRejectedValue(new Error('offline'));
    expect((await openInvoiceForEditing('012'))?.form.previousBalance).toBe(300);
  });
  test('the first invoice of a customer without a stored previous balance starts at zero', async () => {
    const stored = invoice('012');
    delete stored.previousBalance;
    stubLedger([stored]);
    expect((await openInvoiceForEditing('012'))?.form.previousBalance).toBe(0);
  });
  test('read failures propagate so the screen can show "Error loading invoice for editing."', async () => {
    jest.spyOn(db, 'getInvoice').mockRejectedValue(new Error('offline'));
    await expect(openInvoiceForEditing('012')).rejects.toThrow('offline');
  });
});
describe('customer lookup helpers', () => {
  const customers = [
    { phone: '9876543210', name: 'SLN TEX', address: 'Tirupur' },
    { phone: '9000000001', name: 'ABC', address: '' },
  ];
  test('lookup starts at 10 characters, ignoring surrounding spaces (like the web handler)', () => {
    expect(shouldLookupPhone('987654321')).toBe(false);
    expect(shouldLookupPhone('9876543210')).toBe(true);
    expect(shouldLookupPhone(' 987654321 ')).toBe(false);
    expect(shouldLookupPhone('')).toBe(false);
  });
  test('findCustomerByPhone is an exact match on the trimmed phone', () => {
    expect(findCustomerByPhone(customers, ' 9876543210 ')?.name).toBe('SLN TEX');
    expect(findCustomerByPhone(customers, '987654321')).toBeNull();
    expect(findCustomerByPhone(null, '9876543210')).toBeNull();
  });
  test('suggestions match phone or name, leave out the exact phone match and are capped', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      phone: `90000000${i}0`,
      name: `Shop ${i}`,
      address: '',
    }));
    expect(suggestCustomers(customers, 'sln').map((c) => c.phone)).toEqual(['9876543210']);
    expect(suggestCustomers(customers, '9876543210')).toEqual([]);
    expect(suggestCustomers(customers, '   ')).toEqual([]);
    expect(suggestCustomers(many, '9000')).toHaveLength(6);
  });
  test('Enter picks the exact match, else the first suggestion, else nothing', () => {
    expect(customerToPickOnEnter(customers, ' 9000000001 ')?.name).toBe('ABC');
    expect(customerToPickOnEnter(customers, 'sln')?.phone).toBe('9876543210');
    expect(customerToPickOnEnter(customers, 'zzz')).toBeNull();
    expect(customerToPickOnEnter(customers, '')).toBeNull();
  });
  test('roundMoney rounds to paise and tolerates junk', () => {
    expect(roundMoney(1234.5678)).toBe(1234.57);
    expect(roundMoney(-1234.5)).toBe(-1234.5);
    expect(roundMoney(0.004)).toBe(0);
    expect(roundMoney(-0.004)).toBe(0);
    expect(roundMoney(undefined)).toBe(0);
    expect(roundMoney(1234567.891)).toBe(1234567.89);
  });
  test('previousBalanceFor: nothing known -> 0 without touching the ledger', async () => {
    const spy = jest.spyOn(db, 'getAllInvoices');
    expect(await previousBalanceFor('', '', '')).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
  test('previousBalanceFor: a new bill carries forward the latest invoice balance minus its returns', async () => {
    stubLedger([
      invoice('010', { amountPaid: 600, balanceDue: 400 }),
      invoice('011', { subtotal: 250.123, previousBalance: 400, grandTotal: 650.123, amountPaid: 400, balanceDue: 250.123 }),
    ]);
    jest
      .spyOn(db, 'getAllReturns')
      .mockResolvedValue([
        { id: 'r', invoiceNo: '011', returnDate: '', description: '', qty: 1, rate: 50, returnAmount: 50 },
      ]);
    // 250.12 - 50 = 200.12 -> shown/stored with two decimals
    expect(await previousBalanceFor('SLN TEX', '9876543210', '012')).toBe(200.12);
  });
  test('previousBalanceFor: editing an invoice carries in the balance of the invoice before it', async () => {
    stubLedger([
      invoice('010', { amountPaid: 600, balanceDue: 400 }),
      invoice('011', { previousBalance: 400, grandTotal: 1400, amountPaid: 1150, balanceDue: 250 }),
      invoice('012', { previousBalance: 250 }),
    ]);
    expect(await previousBalanceFor('SLN TEX', '9876543210', '011')).toBe(400);
  });
});
