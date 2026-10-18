import { db } from '@/core/db';
import {
  DELETE_BLOCKED_MESSAGE,
  DELETE_BLOCKED_TITLE,
  deleteSalesInvoice,
  deleteSuccessMessage,
  hasPaymentOrReturnHistory,
} from '@/features/history/sales/salesDelete';
afterEach(() => jest.restoreAllMocks());
describe('deleting a sales invoice from history', () => {
  test('blocked while payment or return records exist (web wording)', async () => {
    jest.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([{ id: 'p' }]);
    jest.spyOn(db, 'getReturnsByInvoice').mockResolvedValue([]);
    expect(await hasPaymentOrReturnHistory('003')).toBe(true);
    jest.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([]);
    jest.spyOn(db, 'getReturnsByInvoice').mockResolvedValue([{ id: 'r' }]);
    expect(await hasPaymentOrReturnHistory('003')).toBe(true);
    expect(DELETE_BLOCKED_TITLE).toBe('Action Denied');
    expect(DELETE_BLOCKED_MESSAGE).toBe(
      'Please undo all the payment and return history first before deleting this bill.',
    );
  });
  test('allowed when there is no history; a failing check does not block (the web went on to the dialog)', async () => {
    jest.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([]);
    jest.spyOn(db, 'getReturnsByInvoice').mockResolvedValue([]);
    expect(await hasPaymentOrReturnHistory('003')).toBe(false);
    jest.spyOn(db, 'getPaymentsByInvoice').mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await hasPaymentOrReturnHistory('003')).toBe(false);
  });
  test('delete goes through db.deleteInvoice (recycle bin)', async () => {
    const del = jest.spyOn(db, 'deleteInvoice').mockResolvedValue();
    await deleteSalesInvoice('003');
    expect(del).toHaveBeenCalledWith('003');
  });
  test('success wording is accurate: moved to the Recycle Bin, restorable — not "permanently deleted"', () => {
    const message = deleteSuccessMessage('003');
    expect(message).toBe('Invoice #003 moved to the Recycle Bin — you can restore it from there.');
    expect(message).not.toMatch(/permanent/i);
  });
});
