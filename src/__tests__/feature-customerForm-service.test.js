import { addCustomer, deleteCustomer, updateCustomer } from '@/features/customerForm/customerService';
import { db } from '@/core/db';
afterEach(() => jest.restoreAllMocks());
function stubDb(existing = {}) {
  return {
    getCustomer: jest.spyOn(db, 'getCustomer').mockImplementation(async (phone) => existing[phone] ?? null),
    saveCustomer: jest.spyOn(db, 'saveCustomer').mockResolvedValue('ok'),
    updateCustomerDetails: jest.spyOn(db, 'updateCustomerDetails').mockResolvedValue(),
    deleteCustomerDoc: jest.spyOn(db, 'deleteCustomerDoc').mockResolvedValue(),
    deleteCustomer: jest.spyOn(db, 'deleteCustomer').mockResolvedValue(),
  };
}
describe('addCustomer', () => {
  test('invalid input is rejected before touching the database', async () => {
    const m = stubDb();
    const result = await addCustomer({ phone: '123', name: '', address: '' });
    expect(result).toEqual({
      ok: false,
      errors: {
        phone: 'Please enter a valid phone number (at least 10 digits).',
        name: 'Customer name is required.',
      },
    });
    expect(m.getCustomer).not.toHaveBeenCalled();
    expect(m.saveCustomer).not.toHaveBeenCalled();
  });
  test('an existing phone number is a duplicate', async () => {
    const m = stubDb({ 9876543210: { phone: '9876543210', name: 'Old', address: '' } });
    const result = await addCustomer({ phone: '9876543210', name: 'New', address: '' });
    expect(result).toEqual({
      ok: false,
      errors: { phone: 'A customer with this phone number already exists.' },
    });
    expect(m.saveCustomer).not.toHaveBeenCalled();
  });
  test('saves { phone, name, address, openingBalance } with trimmed values', async () => {
    const m = stubDb();
    const result = await addCustomer({
      phone: ' 9876543210 ',
      name: ' SLN TEX ',
      address: ' Tirupur ',
      openingBalance: '500',
    });
    expect(result).toEqual({ ok: true });
    expect(m.getCustomer).toHaveBeenCalledWith('9876543210');
    expect(m.saveCustomer).toHaveBeenCalledWith({
      phone: '9876543210',
      name: 'SLN TEX',
      address: 'Tirupur',
      openingBalance: 500,
    });
  });
  test('database failures propagate to the caller (the screen shows "Failed to add customer.")', async () => {
    stubDb();
    jest.spyOn(db, 'saveCustomer').mockRejectedValue(new Error('offline'));
    await expect(addCustomer({ phone: '9876543210', name: 'X', address: '' })).rejects.toThrow('offline');
  });
});
describe('updateCustomer', () => {
  const original = { phone: '9876543210', name: 'SLN TEX', address: 'Tirupur' };
  test('invalid input is rejected with the edit messages', async () => {
    const m = stubDb();
    const result = await updateCustomer(original, { phone: '98', name: ' ', address: '' });
    expect(result).toEqual({
      ok: false,
      errors: { phone: 'Please enter a valid phone number.', name: 'Name cannot be empty.' },
    });
    expect(m.updateCustomerDetails).not.toHaveBeenCalled();
  });
  test('same phone: no duplicate check, no document removal', async () => {
    const m = stubDb();
    const result = await updateCustomer(original, {
      phone: '9876543210',
      name: 'SLN TEXTILES',
      address: 'Palladam',
    });
    expect(result).toEqual({ ok: true });
    expect(m.getCustomer).not.toHaveBeenCalled();
    expect(m.updateCustomerDetails).toHaveBeenCalledWith(
      'SLN TEX',
      'SLN TEXTILES',
      '9876543210',
      'Palladam',
      undefined,
      { oldPhone: '9876543210', newOpening: undefined },
    );
    expect(m.deleteCustomerDoc).not.toHaveBeenCalled();
  });
  test('new phone already used by someone else is refused', async () => {
    const m = stubDb({ 9000000001: { phone: '9000000001', name: 'ABC', address: '' } });
    const result = await updateCustomer(original, { phone: '9000000001', name: 'SLN TEX', address: '' });
    expect(result).toEqual({
      ok: false,
      errors: { phone: 'A customer with the new phone number already exists.' },
    });
    expect(m.updateCustomerDetails).not.toHaveBeenCalled();
  });
  test('changed phone: invoices + new document first, then the old document is deleted', async () => {
    const order = [];
    const m = stubDb();
    m.updateCustomerDetails.mockImplementation(async () => {
      order.push('update');
    });
    m.deleteCustomerDoc.mockImplementation(async () => {
      order.push('deleteOld');
    });
    const result = await updateCustomer(original, {
      phone: '9000000002',
      name: 'SLN TEX',
      address: 'Tirupur',
    });
    expect(result).toEqual({ ok: true });
    expect(m.updateCustomerDetails).toHaveBeenCalledWith(
      'SLN TEX',
      'SLN TEX',
      '9000000002',
      'Tirupur',
      undefined,
      {
        oldPhone: '9876543210',
        newOpening: undefined,
      },
    );
    expect(m.deleteCustomerDoc).toHaveBeenCalledWith('9876543210');
    expect(order).toEqual(['update', 'deleteOld']);
  });
  test('failing to remove the old document does not fail the edit (logged only, like the web page)', async () => {
    const m = stubDb();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    m.deleteCustomerDoc.mockRejectedValue(new Error('denied'));
    expect(await updateCustomer(original, { phone: '9000000002', name: 'SLN TEX', address: '' })).toEqual({
      ok: true,
    });
    expect(log).toHaveBeenCalled();
  });
  test('a legacy customer without a phone has no old document to delete', async () => {
    const m = stubDb();
    const legacy = { name: 'Walk-in', address: '' };
    expect(await updateCustomer(legacy, { phone: '9000000002', name: 'Walk-in', address: '' })).toEqual({
      ok: true,
    });
    expect(m.updateCustomerDetails).toHaveBeenCalledWith('Walk-in', 'Walk-in', '9000000002', '', undefined, {
      oldPhone: '',
      newOpening: undefined,
    });
    expect(m.deleteCustomerDoc).not.toHaveBeenCalled();
  });
  test('the ledger gets a new opening balance only when it was changed on the form', async () => {
    const m = stubDb();
    const withOpening = { ...original, openingBalance: 500 };
    await updateCustomer(withOpening, {
      phone: '9876543210',
      name: 'SLN TEX',
      address: '',
      openingBalance: '500',
    });
    expect(m.updateCustomerDetails.mock.calls[0][5].newOpening).toBeUndefined();
    await updateCustomer(withOpening, {
      phone: '9876543210',
      name: 'SLN TEX',
      address: '',
      openingBalance: '750',
    });
    expect(m.updateCustomerDetails.mock.calls[1][5].newOpening).toBe(750);
  });
});
describe('deleteCustomer', () => {
  test('delegates to db.deleteCustomer (customer document removed, invoices moved to the recycle bin)', async () => {
    const m = stubDb();
    await deleteCustomer('9876543210');
    expect(m.deleteCustomer).toHaveBeenCalledWith('9876543210');
  });
});
