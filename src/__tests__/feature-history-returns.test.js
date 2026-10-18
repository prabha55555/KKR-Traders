import { db } from '@/core/db';
import {
  alreadyReturnedQty,
  chooseReturnProduct,
  newReturnItem,
  returnItemAmount,
  returnItemDescription,
  returnSuccessMessage,
  returnSummary,
  returnedQtyByDescription,
  validateReturnDraft,
} from '@/features/history/lib/returns';
import {
  buildReturnRecord,
  saveSalesReturn,
  undoAllSalesReturns,
  undoSalesReturn,
} from '@/features/history/sales/salesReturns';
const products = [
  { description: 'Shirt', qty: 5, rate: 100, amount: 500 },
  { description: 'Trouser', qty: 2, rate: 250.5, amount: 501 },
];
const item = (over) => ({ ...newReturnItem('k'), ...over });
const shirt = (qty, over = {}) => item({ choice: 0, qty, rate: '100', ...over });
const validate = (over = {}) =>
  validateReturnDraft({
    returnDate: '2026-10-03',
    items: [shirt('1')],
    products,
    existingReturns: [],
    currentBalance: 1000,
    ...over,
  });
describe('return line editing', () => {
  test('picking an invoice product copies its rate; custom clears text and zeroes the rate', () => {
    const picked = chooseReturnProduct(item({ qty: '2', rate: '7', custom: 'x' }), 1, products);
    expect(picked).toMatchObject({ choice: 1, rate: '250.5', custom: '', qty: '2' });
    const custom = chooseReturnProduct(picked, 'custom', products);
    expect(custom).toMatchObject({ choice: 'custom', rate: '0', custom: '' });
    expect(chooseReturnProduct(custom, null, products).choice).toBeNull();
  });
  test('description comes from the product, the (trimmed) custom text, or is empty', () => {
    expect(returnItemDescription(item({ choice: 0 }), products)).toBe('Shirt');
    expect(returnItemDescription(item({ choice: 'custom', custom: '  Fancy ' }), products)).toBe('Fancy');
    expect(returnItemDescription(item({ choice: null }), products)).toBe('');
  });
  test('amount = qty x rate rounded to 2 decimals (the read-only field held toFixed(2))', () => {
    expect(returnItemAmount({ qty: '3', rate: '10.1' })).toBe(30.3);
    expect(returnItemAmount({ qty: '2', rate: '250.5' })).toBe(501);
    expect(returnItemAmount({ qty: '', rate: 'x' })).toBe(0);
  });
  test('summary: new adjusted balance = current balance - this return', () => {
    expect(
      returnSummary(
        [
          { qty: '2', rate: '100' },
          { qty: '1', rate: '50.5' },
        ],
        1000,
      ),
    ).toEqual({ total: 250.5, newAdjustedBalance: 749.5 });
  });
  test('returned quantity per product', () => {
    const returns = [
      { description: 'Shirt', qty: 2 },
      { description: 'Trouser', qty: 1 },
      { description: 'Shirt', qty: 1 },
    ];
    expect(alreadyReturnedQty(returns, 'Shirt')).toBe(3);
    expect(alreadyReturnedQty(returns, 'Other')).toBe(0);
    expect(returnedQtyByDescription(returns).get('Shirt')).toBe(3);
  });
});
describe('validateReturnDraft (order and wording of saveReturn)', () => {
  test('return date first, then at least one item', () => {
    expect(validate({ returnDate: '' })).toEqual({
      ok: false,
      title: 'Warning',
      message: 'Please select a return date.',
    });
    expect(validate({ items: [] })).toEqual({
      ok: false,
      title: 'Warning',
      message: 'Please add at least one return item.',
    });
  });
  test('every line needs a product, qty > 0 and rate > 0 (numbered from 1)', () => {
    expect(validate({ items: [shirt('1'), shirt('0')] })).toMatchObject({
      ok: false,
      title: 'Warning',
      message: 'Please fill all required fields for return item 2',
    });
    expect(validate({ items: [shirt('1', { rate: '0' })] })).toMatchObject({
      ok: false,
      message: 'Please fill all required fields for return item 1',
    });
    expect(validate({ items: [item({ qty: '1', rate: '5' })] })).toMatchObject({
      ok: false,
      message: 'Please fill all required fields for return item 1',
    });
    expect(
      validate({ items: [item({ choice: 'custom', custom: '   ', qty: '1', rate: '5' })] }),
    ).toMatchObject({
      ok: false,
    });
  });
  test('quantity is limited to what was sold minus what was already returned', () => {
    const existing = [{ description: 'Shirt', qty: 3 }];
    expect(validate({ items: [shirt('2')], existingReturns: existing })).toMatchObject({ ok: true });
    expect(validate({ items: [shirt('3')], existingReturns: existing })).toEqual({
      ok: false,
      title: 'Error',
      message: 'Cannot return 3 items. Only 2 items available for return for "Shirt".',
    });
  });
  test('deviation: two lines of the same product in one submission count together', () => {
    const result = validate({ items: [shirt('3', { key: 'a' }), shirt('3', { key: 'b' })] });
    expect(result).toEqual({
      ok: false,
      title: 'Error',
      message: 'Cannot return 3 items. Only 2 items available for return for "Shirt".',
    });
  });
  test('custom products are not limited', () => {
    expect(
      validate({ items: [item({ choice: 'custom', custom: 'Gift box', qty: '50', rate: '2' })] }),
    ).toMatchObject({
      ok: true,
      total: 100,
    });
  });
  test('the total must not exceed the current balance', () => {
    expect(validate({ items: [shirt('5')], currentBalance: 400 })).toEqual({
      ok: false,
      title: 'Error',
      message: 'Return amount (₹500.00) cannot exceed current balance (₹400.00)',
    });
    expect(validate({ items: [shirt('5')], currentBalance: 500 })).toMatchObject({ ok: true });
  });
  test('success: lines carry description, qty, rate, rounded amount, reason (untrimmed) and the date', () => {
    const result = validate({
      items: [shirt('2', { reason: ' torn ' }), item({ choice: 1, qty: '1', rate: '250.5' })],
    });
    expect(result).toEqual({
      ok: true,
      total: 450.5,
      lines: [
        {
          description: 'Shirt',
          qty: 2,
          rate: 100,
          returnAmount: 200,
          reason: ' torn ',
          returnDate: '2026-10-03',
        },
        {
          description: 'Trouser',
          qty: 1,
          rate: 250.5,
          returnAmount: 250.5,
          reason: '',
          returnDate: '2026-10-03',
        },
      ],
    });
  });
  test('success message', () => {
    expect(returnSuccessMessage(450.5)).toBe('Return processed successfully! Total return amount: ₹450.50');
  });
});
// ------------------------------------------------------------------ service flows (db mocked)
const invoice = (over = {}) => ({
  invoiceNo: '003',
  invoiceDate: '2026-10-01',
  customerName: 'SLN TEX',
  customerAddress: '',
  customerPhone: '9876543210',
  products,
  subtotal: 1001,
  previousBalance: 0,
  grandTotal: 1001,
  amountPaid: 301,
  balanceDue: 700,
  ...over,
});
/** in-memory returns collection + saved invoices so updateInvoiceWithReturns sees what was written */
function mockStore(inv, initialReturns = []) {
  const returns = [...initialReturns];
  const savedInvoices = [];
  const events = [];
  jest.spyOn(db, 'getInvoice').mockResolvedValue(inv);
  jest.spyOn(db, 'getReturnsByInvoice').mockImplementation(async () => [...returns]);
  jest.spyOn(db, 'saveReturn').mockImplementation(async (r) => {
    events.push('saveReturn');
    returns.push({ ...r, id: `r${returns.length + 1}` });
    return 'id';
  });
  jest.spyOn(db, 'deleteReturn').mockImplementation(async (id) => {
    events.push(`deleteReturn:${id}`);
    const i = returns.findIndex((r) => r.id === String(id));
    if (i >= 0) returns.splice(i, 1);
  });
  jest.spyOn(db, 'saveInvoice').mockImplementation(async (i) => {
    events.push('saveInvoice');
    savedInvoices.push(i);
    return i.invoiceNo;
  });
  jest.spyOn(db, 'updateSubsequentInvoices').mockImplementation(async (name, no) => {
    events.push(`subsequent:${name}:${no}`);
  });
  return { returns, savedInvoices, events };
}
afterEach(() => jest.restoreAllMocks());
describe('saveSalesReturn', () => {
  test('writes one return document per line, then refreshes the invoice totals and later invoices', async () => {
    const store = mockStore(invoice());
    const now = new Date('2026-10-03T08:00:00.000Z');
    const result = await saveSalesReturn(
      '003',
      {
        returnDate: '2026-10-03',
        items: [shirt('2', { reason: 'torn' }), item({ choice: 1, qty: '1', rate: '250.5' })],
      },
      now,
    );
    expect(result).toEqual({ ok: true, total: 450.5 });
    expect(store.returns.map(({ id: _id, ...rest }) => rest)).toEqual([
      {
        invoiceNo: '003',
        customerName: 'SLN TEX',
        description: 'Shirt',
        qty: 2,
        rate: 100,
        returnAmount: 200,
        reason: 'torn',
        returnDate: '2026-10-03',
        createdAt: now.toISOString(),
      },
      {
        invoiceNo: '003',
        customerName: 'SLN TEX',
        description: 'Trouser',
        qty: 1,
        rate: 250.5,
        returnAmount: 250.5,
        reason: '',
        returnDate: '2026-10-03',
        createdAt: now.toISOString(),
      },
    ]);
    // updateInvoiceWithReturns: totalReturns + adjustedBalanceDue = balanceDue - totalReturns
    expect(store.savedInvoices[0]).toMatchObject({
      invoiceNo: '003',
      totalReturns: 450.5,
      adjustedBalanceDue: 249.5,
    });
    expect(store.events).toEqual(['saveReturn', 'saveReturn', 'saveInvoice', 'subsequent:SLN TEX:003']);
  });
  test('qty limits use the returns already stored in the database', async () => {
    const store = mockStore(invoice(), [
      { id: 'r0', invoiceNo: '003', description: 'Shirt', qty: 4, returnAmount: 400 },
    ]);
    const result = await saveSalesReturn('003', { returnDate: '2026-10-03', items: [shirt('2')] });
    expect(result).toEqual({
      ok: false,
      title: 'Error',
      message: 'Cannot return 2 items. Only 1 items available for return for "Shirt".',
    });
    expect(store.events).toEqual([]);
  });
  test('the balance check uses balanceDue minus the returns already stored', async () => {
    const store = mockStore(invoice({ balanceDue: 300 }), [
      { id: 'r0', invoiceNo: '003', description: 'Gift', qty: 1, returnAmount: 100 },
    ]);
    const result = await saveSalesReturn('003', { returnDate: '2026-10-03', items: [shirt('3')] });
    expect(result).toEqual({
      ok: false,
      title: 'Error',
      message: 'Return amount (₹300.00) cannot exceed current balance (₹200.00)',
    });
    expect(store.events).toEqual([]);
  });
  test('unknown invoice is reported, nothing is written', async () => {
    jest.spyOn(db, 'getInvoice').mockResolvedValue(null);
    const save = jest.spyOn(db, 'saveReturn');
    await expect(saveSalesReturn('999', { returnDate: '2026-10-03', items: [shirt('1')] })).rejects.toThrow(
      'Invoice not found!',
    );
    expect(save).not.toHaveBeenCalled();
  });
  test('buildReturnRecord field names are the web ones', () => {
    expect(
      Object.keys(
        buildReturnRecord(
          '003',
          'SLN TEX',
          { description: 'Shirt', qty: 1, rate: 2, returnAmount: 2, reason: '', returnDate: '2026-10-03' },
          new Date(),
        ),
      ),
    ).toEqual([
      'invoiceNo',
      'customerName',
      'description',
      'qty',
      'rate',
      'returnAmount',
      'reason',
      'returnDate',
      'createdAt',
    ]);
  });
});
describe('undo returns', () => {
  test("undo one: delete the return, refresh the invoice, then the customer's later invoices", async () => {
    const store = mockStore(invoice({ totalReturns: 200, adjustedBalanceDue: 500 }), [
      { id: 'r1', invoiceNo: '003', description: 'Shirt', qty: 2, returnAmount: 200 },
      { id: 'r2', invoiceNo: '003', description: 'Trouser', qty: 1, returnAmount: 100 },
    ]);
    await undoSalesReturn('003', 'r1');
    expect(store.events).toEqual(['deleteReturn:r1', 'saveInvoice', 'subsequent:SLN TEX:003']);
    expect(store.savedInvoices[0]).toMatchObject({ totalReturns: 100, adjustedBalanceDue: 600 });
  });
  test('undo all: every return deleted, totals back to zero', async () => {
    const store = mockStore(invoice(), [
      { id: 'r1', invoiceNo: '003', description: 'Shirt', qty: 2, returnAmount: 200 },
      { id: 'r2', invoiceNo: '003', description: 'Trouser', qty: 1, returnAmount: 100 },
    ]);
    expect(await undoAllSalesReturns('003')).toBe(2);
    expect(store.events).toEqual([
      'deleteReturn:r1',
      'deleteReturn:r2',
      'saveInvoice',
      'subsequent:SLN TEX:003',
    ]);
    expect(store.savedInvoices[0]).toMatchObject({ totalReturns: 0, adjustedBalanceDue: 700 });
  });
  test('undo all without returns does nothing', async () => {
    const store = mockStore(invoice());
    expect(await undoAllSalesReturns('003')).toBeNull();
    expect(store.events).toEqual([]);
  });
});
