import { loadCustomerSummaries } from '@/features/customerDetails/customerService';
import { db } from '@/core/db';
const invoice = (over) => ({
  invoiceNo: '1',
  invoiceDate: '2026-10-01',
  customerName: 'Ravi',
  customerAddress: 'Tirupur',
  customerPhone: '9876543210',
  products: [],
  subtotal: 1000,
  previousBalance: 0,
  grandTotal: 1000,
  amountPaid: 250,
  balanceDue: 750,
  ...over,
});
afterEach(() => jest.restoreAllMocks());
describe('loadCustomerSummaries', () => {
  test('aggregates exactly the invoices and returns collections (no customers / payments reads)', async () => {
    const invoices = jest.spyOn(db, 'getAllInvoices').mockResolvedValue([invoice({})]);
    const returns = jest.spyOn(db, 'getAllReturns').mockResolvedValue([
      {
        id: 'r',
        invoiceNo: '1',
        returnDate: '2026-10-02',
        description: 'x',
        qty: 1,
        rate: 100,
        returnAmount: 100,
      },
    ]);
    const customers = jest.spyOn(db, 'getAllCustomers');
    const payments = jest.spyOn(db, 'getAllPayments');
    const result = await loadCustomerSummaries();
    expect(invoices).toHaveBeenCalledTimes(1);
    expect(returns).toHaveBeenCalledTimes(1);
    expect(customers).not.toHaveBeenCalled();
    expect(payments).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Ravi',
      totalCurrentBillAmount: 1000,
      amountPaid: 250,
      totalReturns: 100,
    });
  });
  test('no invoices -> empty list', async () => {
    jest.spyOn(db, 'getAllInvoices').mockResolvedValue([]);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue([]);
    await expect(loadCustomerSummaries()).resolves.toEqual([]);
  });
  test('a failed read rejects so the screen can show its error state', async () => {
    jest.spyOn(db, 'getAllInvoices').mockRejectedValue(new Error('offline'));
    jest.spyOn(db, 'getAllReturns').mockResolvedValue([]);
    await expect(loadCustomerSummaries()).rejects.toThrow('offline');
  });
});
