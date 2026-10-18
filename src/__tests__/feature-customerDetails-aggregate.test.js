import {
  buildCustomerSummaries,
  computeStats,
  customerBalance,
  filterCustomers,
} from '@/features/customerDetails/aggregate';
const inv = (over) => ({
  invoiceNo: '1',
  invoiceDate: '2026-01-01',
  customerName: 'X',
  customerAddress: '',
  customerPhone: '',
  products: [],
  subtotal: 0,
  previousBalance: 0,
  grandTotal: 0,
  amountPaid: 0,
  balanceDue: 0,
  ...over,
});
const ret = (over) => ({
  id: 'r1',
  invoiceNo: '1',
  returnDate: '2026-01-01',
  description: 'Shirt',
  qty: 1,
  rate: 1,
  returnAmount: 0,
  ...over,
});
/** getAllInvoices() order: newest invoice date first. */
const INVOICES = [
  inv({
    invoiceNo: '12',
    invoiceDate: '2026-10-03',
    customerName: 'Ravi',
    customerPhone: '9876543210',
    customerAddress: 'Gandhi Road, Tirupur',
    subtotal: 1000,
    previousBalance: 500,
    discountAmount: 50,
    grandTotal: 1450,
    amountPaid: 400,
    balanceDue: 1050,
  }),
  inv({
    invoiceNo: '11',
    invoiceDate: '2026-09-20',
    customerName: 'Ravi',
    // a different phone / address on an older invoice must NOT replace the first one seen
    customerPhone: '1111111111',
    customerAddress: 'Old Address',
    subtotal: 500,
    grandTotal: 500,
    amountPaid: 0,
    balanceDue: 500,
  }),
  // only a name: no phone, no address
  inv({
    invoiceNo: '5',
    invoiceDate: '2026-09-15',
    customerName: 'Meena',
    subtotal: 250.5,
    grandTotal: 250.5,
    amountPaid: 250.5,
  }),
  // no customer name: skipped by the web page
  inv({
    invoiceNo: '99',
    invoiceDate: '2026-09-12',
    customerName: '',
    subtotal: 9999,
    amountPaid: 1,
    grandTotal: 9999,
  }),
  inv({
    invoiceNo: '20',
    invoiceDate: '2026-09-10',
    customerName: 'Kumar',
    customerPhone: '98 76-5',
    subtotal: 800,
    grandTotal: 800,
    // Firestore documents written by older versions held numbers as strings; the legacy `discount` is ignored
    amountPaid: '100',
    discount: 30,
  }),
];
const RETURNS = [
  ret({ id: 'a', invoiceNo: '12', returnAmount: 30.25 }),
  ret({ id: 'b', invoiceNo: '11', returnAmount: 120.5 }),
  ret({ id: 'c', invoiceNo: '11', returnAmount: 79.5 }),
  // return of an invoice that belongs to nobody on the list
  ret({ id: 'd', invoiceNo: '77', returnAmount: 500 }),
];
describe('buildCustomerSummaries (processCustomerData)', () => {
  const customers = buildCustomerSummaries(INVOICES, RETURNS);
  const byName = (name) => customers.find((c) => c.name === name);
  test('one row per exact customerName, in order of first appearance; nameless invoices are skipped', () => {
    expect(customers.map((c) => c.name)).toEqual(['Ravi', 'Meena', 'Kumar']);
  });
  test('sums subtotal / amountPaid / discountAmount over the invoices; counts invoices', () => {
    const ravi = byName('Ravi');
    expect(ravi.totalInvoices).toBe(2);
    expect(ravi.totalCurrentBillAmount).toBe(1500); // 1000 + 500 (subtotal, NOT grandTotal 1450 + 500)
    expect(ravi.amountPaid).toBe(400);
    expect(ravi.totalDiscountAmount).toBe(50);
  });
  test('phone and address come from the first (newest) invoice only', () => {
    const ravi = byName('Ravi');
    expect(ravi.phone).toBe('9876543210');
    expect(ravi.address).toBe('Gandhi Road, Tirupur');
  });
  test('returns are summed per invoice number and attached to the customer owning that invoice', () => {
    // invoice 12: 30.25, invoice 11: 120.5 + 79.5 ; the return of invoice 77 matches nobody
    expect(byName('Ravi').totalReturns).toBe(230.25);
    expect(byName('Meena').totalReturns).toBe(0);
    expect(byName('Kumar').totalReturns).toBe(0);
  });
  test('balance = bill amounts - paid - returns - discount', () => {
    // Ravi: 1500 - 400 - 230.25 - 50 = 819.75
    expect(customerBalance(byName('Ravi'))).toBe(819.75);
    // Kumar: 800 - 100 (string amount coerced) - 0 - 0 (legacy `discount` ignored) = 700
    expect(customerBalance(byName('Kumar'))).toBe(700);
  });
  test('a fully paid customer with no phone / address still appears, with a zero balance', () => {
    const meena = byName('Meena');
    expect(meena.phone).toBe('');
    expect(meena.address).toBe('');
    expect(meena.totalInvoices).toBe(1);
    expect(customerBalance(meena)).toBe(0);
  });
  test('last invoice = newest invoiceDate; invoice numbers are sorted numerically, newest first', () => {
    const ravi = byName('Ravi');
    expect(ravi.lastInvoiceNo).toBe('12');
    expect(ravi.lastInvoiceDate).toBe('2026-10-03');
    expect(ravi.allInvoiceNumbers).toEqual(['12', '11']);
  });
  test('invoice numbers sort as numbers (100 > 10 > 9), not as text', () => {
    const list = buildCustomerSummaries(
      [
        inv({ invoiceNo: '9' }),
        inv({ invoiceNo: '100' }),
        inv({ invoiceNo: '10' }),
        inv({ invoiceNo: 'A-7' }),
      ],
      [],
    );
    // 'A-7' has no leading digits -> value 0 -> last
    expect(list[0].allInvoiceNumbers).toEqual(['100', '10', '9', 'A-7']);
  });
  test('missing numeric fields count as 0 and the customer is still listed', () => {
    const bare = { invoiceNo: '3', customerName: 'Bare' };
    const [c] = buildCustomerSummaries([bare], []);
    expect(c).toMatchObject({
      name: 'Bare',
      phone: '',
      address: '',
      totalInvoices: 1,
      totalCurrentBillAmount: 0,
      amountPaid: 0,
      totalDiscountAmount: 0,
      totalReturns: 0,
      allInvoiceNumbers: ['3'],
    });
    expect(c.lastInvoiceDate).toBeUndefined();
    expect(c.lastInvoiceNo).toBeUndefined();
  });
  test('customers are matched by name, never by phone', () => {
    const list = buildCustomerSummaries(
      [
        inv({ invoiceNo: '2', customerName: 'Anu', customerPhone: '9000000001', subtotal: 10 }),
        inv({ invoiceNo: '1', customerName: 'Anu K', customerPhone: '9000000001', subtotal: 20 }),
        inv({ invoiceNo: '0', customerName: 'Anu', customerPhone: '9000000002', subtotal: 5 }),
      ],
      [],
    );
    expect(list.map((c) => [c.name, c.phone, c.totalCurrentBillAmount])).toEqual([
      ['Anu', '9000000001', 15],
      ['Anu K', '9000000001', 20],
    ]);
  });
  test('on a date tie the first invoice seen stays the last invoice; invoices without a date never become it', () => {
    const [c] = buildCustomerSummaries(
      [
        inv({ invoiceNo: '8', invoiceDate: '2026-05-01' }),
        inv({ invoiceNo: '9', invoiceDate: '2026-05-01' }),
        inv({ invoiceNo: '10', invoiceDate: '' }),
      ],
      [],
    );
    expect(c.lastInvoiceNo).toBe('8');
    expect(c.lastInvoiceDate).toBe('2026-05-01');
  });
  test('returns of an invoice are summed in the stored order (0.1 + 0.2 float result is preserved)', () => {
    const [c] = buildCustomerSummaries(
      [inv({ invoiceNo: '4' })],
      [ret({ invoiceNo: '4', returnAmount: 0.1 }), ret({ invoiceNo: '4', returnAmount: 0.2 })],
    );
    expect(c.totalReturns).toBe(0.1 + 0.2);
  });
  test('no invoices -> no customers (customers who never got an invoice are not listed)', () => {
    expect(buildCustomerSummaries([], RETURNS)).toEqual([]);
  });
});
describe('computeStats (updateStatistics)', () => {
  const customers = buildCustomerSummaries(INVOICES, RETURNS);
  test('totals over the customer list', () => {
    expect(computeStats(customers)).toEqual({
      totalCustomers: 3,
      totalInvoices: 4,
      totalCurrentBillAmount: 2550.5, // 1500 + 250.5 + 800
      totalPaid: 750.5, // 400 + 250.5 + 100
      totalReturns: 230.25,
      totalDiscountAmount: 50,
      pendingBalance: 1519.75, // 2550.5 - 750.5 - 230.25 - 50 == 819.75 + 0 + 700
    });
  });
  test('is recomputed over a filtered list (the web updated the cards on every search)', () => {
    const only = filterCustomers(customers, 'meena');
    expect(computeStats(only)).toMatchObject({
      totalCustomers: 1,
      totalInvoices: 1,
      totalCurrentBillAmount: 250.5,
      totalPaid: 250.5,
      totalReturns: 0,
      totalDiscountAmount: 0,
      pendingBalance: 0,
    });
  });
  test('empty list -> zeros', () => {
    expect(computeStats([])).toEqual({
      totalCustomers: 0,
      totalInvoices: 0,
      totalCurrentBillAmount: 0,
      totalPaid: 0,
      totalReturns: 0,
      totalDiscountAmount: 0,
      pendingBalance: 0,
    });
  });
  test('an over-paying customer gives a negative balance that reduces the pending total', () => {
    const list = buildCustomerSummaries(
      [
        inv({ invoiceNo: '2', customerName: 'A', subtotal: 100, amountPaid: 150 }),
        inv({ invoiceNo: '1', customerName: 'B', subtotal: 300, amountPaid: 100 }),
      ],
      [],
    );
    expect(customerBalance(list[0])).toBe(-50);
    expect(computeStats(list).pendingBalance).toBe(150); // -50 + 200
  });
});
describe('filterCustomers (searchCustomers)', () => {
  const customers = buildCustomerSummaries(INVOICES, RETURNS);
  const names = (term) => filterCustomers(customers, term).map((c) => c.name);
  test('empty / blank term returns everyone (same array)', () => {
    expect(filterCustomers(customers, '')).toBe(customers);
    expect(filterCustomers(customers, '   ')).toBe(customers);
  });
  test('name: case-insensitive substring, term is trimmed', () => {
    expect(names('  RAV ')).toEqual(['Ravi']);
    expect(names('kum')).toEqual(['Kumar']);
  });
  test('phone: raw substring of the stored phone (no digit normalisation)', () => {
    expect(names('98765')).toEqual(['Ravi']);
    expect(names('98 76')).toEqual(['Kumar']);
    expect(names('9876-5')).toEqual([]);
  });
  test('address: case-insensitive substring', () => {
    expect(names('tirupur')).toEqual(['Ravi']);
  });
  test("invoice number: any of the customer's invoice numbers (hidden feature of the web search)", () => {
    expect(names('11')).toEqual(['Ravi']);
    expect(names('20')).toEqual(['Kumar']);
  });
  test('no match -> empty list', () => {
    expect(names('zzz')).toEqual([]);
  });
});
