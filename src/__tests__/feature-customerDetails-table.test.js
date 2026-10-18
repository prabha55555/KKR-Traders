import { buildRowModel } from '@/features/customerDetails/rowModel';
import { CUSTOMER_COLUMNS, FIXED_COLUMNS_WIDTH } from '@/features/customerDetails/tableColumns';
const customer = (over = {}) => ({
  name: 'Ravi',
  phone: '9876543210',
  address: '',
  totalInvoices: 2,
  totalCurrentBillAmount: 1500,
  amountPaid: 400,
  totalDiscountAmount: 50,
  totalReturns: 230.25,
  allInvoiceNumbers: ['12', '11'],
  ...over,
});
describe("table columns (the web page's <table>)", () => {
  test('same ten columns, same order and header text as customer-details.html', () => {
    expect(CUSTOMER_COLUMNS.map((c) => c.header)).toEqual([
      'Customer Name',
      'Phone',
      'Address',
      'Total Invoices',
      'Total Amount',
      'Amount Paid',
      'Discount',
      'Returns',
      'Balance Due',
      'WhatsApp Reminder',
    ]);
    expect(new Set(CUSTOMER_COLUMNS.map((c) => c.key)).size).toBe(10);
  });
  test('only name and address flex; every other column has a fixed width; amounts are right-aligned', () => {
    const flexible = CUSTOMER_COLUMNS.filter((c) => c.flex !== undefined).map((c) => c.key);
    expect(flexible).toEqual(['name', 'address']);
    expect(CUSTOMER_COLUMNS.filter((c) => c.flex === undefined).every((c) => (c.width ?? 0) > 0)).toBe(true);
    const right = CUSTOMER_COLUMNS.filter((c) => c.align === 'right').map((c) => c.key);
    expect(right).toEqual(['invoices', 'amount', 'paid', 'discount', 'returns', 'balance']);
  });
  test('fixed columns leave room for name and address inside a 1280px window (968px content area)', () => {
    expect(968 - FIXED_COLUMNS_WIDTH).toBeGreaterThanOrEqual(2 * 96);
  });
});
describe('buildRowModel (cells shared by the cards and the table)', () => {
  test('owing customer with returns and discount', () => {
    expect(buildRowModel(customer())).toEqual({
      invoices: '2',
      openingBalance: '₹0.00',
      amount: '₹1,500.00',
      paid: '₹400.00',
      discount: '₹50.00',
      returns: '₹230.25',
      balance: '₹819.75',
      hasReturns: true,
      canRemind: true,
      tones: {
        openingBalance: 'neutral',
        amount: 'positive',
        paid: 'positive',
        discount: 'negative',
        returns: 'negative',
        balance: 'negative',
      },
    });
  });
  test('no returns shows ₹0.00 in neutral; a settled customer has a neutral balance and no reminder', () => {
    const row = buildRowModel(customer({ totalReturns: 0, amountPaid: 1450 }));
    expect(row.returns).toBe('₹0.00');
    expect(row.hasReturns).toBe(false);
    expect(row.tones.returns).toBe('neutral');
    expect(row.balance).toBe('₹0.00');
    expect(row.tones.balance).toBe('neutral');
    expect(row.canRemind).toBe(false);
  });
  test('credit balance is positive (green) and gets no reminder; no phone gets no reminder', () => {
    const credit = buildRowModel(customer({ totalReturns: 0, amountPaid: 2000 }));
    expect(credit.balance).toBe('₹-550.00');
    expect(credit.tones.balance).toBe('positive');
    expect(credit.canRemind).toBe(false);
    expect(buildRowModel(customer({ phone: '' })).canRemind).toBe(false);
  });
  test('Indian digit grouping for large amounts', () => {
    expect(buildRowModel(customer({ totalCurrentBillAmount: 1234567.5 })).amount).toBe('₹12,34,567.50');
  });
});
