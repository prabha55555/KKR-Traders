import {
  editBill,
  editParamAction,
  loadedBillSession,
  markSaved,
  newBillSession,
  outputGuard,
  planSave,
  saveButtonLabel,
  savedBillMessage,
  unsavedBillError,
  withRefreshedPreviousBalance,
} from '@/features/salesBill/billSession';
import { emptySalesForm } from '@/core/services/salesBill';
const shortcuts = [{ shortcutKey: 'SH', fullDescription: 'Cotton Shirt' }];
const form = (over = {}) => ({
  ...emptySalesForm(),
  invoiceNo: '012',
  invoiceDate: '2026-10-03',
  customerName: 'SLN TEX',
  customerAddress: 'Tirupur',
  customerPhone: '9876543210',
  rows: [{ description: 'Cotton Shirt', qty: '1', rate: '100' }],
  ...over,
});
const session = (over = {}) => ({
  form: form(),
  saved: false,
  editingNo: null,
  persistedNo: null,
  ...over,
});
describe('bill session transitions', () => {
  test('a new session is an empty, unsaved, non-edit bill dated today', () => {
    const s = newBillSession();
    expect(s).toMatchObject({ saved: false, editingNo: null, persistedNo: null });
    expect(s.form.invoiceNo).toBe('');
    expect(s.form.rows).toHaveLength(1);
  });
  test('any field change marks the bill unsaved and leaves the rest alone', () => {
    const saved = session({ saved: true, persistedNo: '012' });
    const next = editBill(saved, { discountAmount: '10' });
    expect(next.saved).toBe(false);
    expect(next.form.discountAmount).toBe('10');
    expect(next.form.customerName).toBe('SLN TEX');
    expect(next.persistedNo).toBe('012');
    expect(next.form).not.toBe(saved.form);
  });
  test('markSaved marks the form saved and remembers the (trimmed) stored number', () => {
    const s = session({ form: form({ invoiceNo: ' 012 ' }) });
    const done = markSaved(s, s.form);
    expect(done).toMatchObject({ saved: true, persistedNo: '012' });
  });
  test('markSaved keeps the bill unsaved when the form changed while saving', () => {
    const s = session();
    const edited = editBill(s, { customerName: 'OTHER' });
    const done = markSaved(edited, s.form);
    expect(done.saved).toBe(false);
    expect(done.persistedNo).toBe('012');
  });
  test('a loaded bill is saved, in edit mode, and its number is the persisted one', () => {
    const s = loadedBillSession(form(), '012');
    expect(s).toMatchObject({ saved: true, editingNo: '012', persistedNo: '012' });
  });
  test('save button label follows edit mode', () => {
    expect(saveButtonLabel(session())).toBe('Save Bill');
    expect(saveButtonLabel(session({ editingNo: '012' }))).toBe('Update Bill');
  });
});
describe('editParamAction (route search param ?edit=)', () => {
  test('a new invoice number loads it', () => {
    expect(editParamAction('012', { editingNo: null })).toEqual({ type: 'load', invoiceNo: '012' });
    expect(editParamAction('013', { editingNo: '012' })).toEqual({ type: 'load', invoiceNo: '013' });
  });
  test('the invoice that is already open is not reloaded', () => {
    expect(editParamAction('012', { editingNo: '012' })).toEqual({ type: 'none' });
  });
  test('clearing the param while editing resets to a new bill; with nothing open it does nothing', () => {
    expect(editParamAction(undefined, { editingNo: '012' })).toEqual({ type: 'reset' });
    expect(editParamAction('', { editingNo: '012' })).toEqual({ type: 'reset' });
    expect(editParamAction(undefined, { editingNo: null })).toEqual({ type: 'none' });
  });
});
describe('withRefreshedPreviousBalance', () => {
  test('updates a bill that is still being composed', () => {
    const s = session({ form: form({ previousBalance: 100 }) });
    expect(withRefreshedPreviousBalance(s, 250).form.previousBalance).toBe(250);
  });
  test('never touches saved or edited bills, and returns the same object when nothing changed', () => {
    const edited = session({ editingNo: '012', form: form({ previousBalance: 100 }) });
    expect(withRefreshedPreviousBalance(edited, 250)).toBe(edited);
    const saved = session({ saved: true, form: form({ previousBalance: 100 }) });
    expect(withRefreshedPreviousBalance(saved, 250)).toBe(saved);
    const same = session({ form: form({ previousBalance: 250 }) });
    expect(withRefreshedPreviousBalance(same, 250)).toBe(same);
  });
});
describe('outputGuard (Generate / Share BILL)', () => {
  test('texts are the web page toasts', () => {
    expect(unsavedBillError('pdf')).toEqual({
      title: 'Unsaved Bill',
      message: 'Please click "Save Bill" first before generating the PDF.',
    });
    expect(unsavedBillError('whatsapp').message).toBe(
      'Please click "Save Bill" first before sharing on WhatsApp.',
    );
  });
  test('an unsaved bill is blocked, a saved unchanged bill passes', () => {
    expect(outputGuard(session({ saved: false }), shortcuts, 'pdf')).toEqual(unsavedBillError('pdf'));
    expect(outputGuard(session({ saved: true }), shortcuts, 'whatsapp')).toBeNull();
  });
  test('validation runs before the saved check', () => {
    const invalid = session({ saved: false, form: form({ customerName: '' }) });
    expect(outputGuard(invalid, shortcuts, 'pdf')?.title).toBe('Missing Information');
  });
  test('editing after a save blocks output again', () => {
    const saved = session({ saved: true });
    expect(outputGuard(editBill(saved, { cash: '5' }), shortcuts, 'pdf')?.title).toBe('Unsaved Bill');
  });
});
describe('planSave', () => {
  const exists = (value) => jest.fn().mockResolvedValue(value);
  test('invalid forms never reach the existence check', async () => {
    const check = exists(true);
    const plan = await planSave(session({ form: form({ invoiceNo: ' ' }) }), shortcuts, check);
    expect(plan).toEqual({
      kind: 'invalid',
      error: { title: 'Missing Information', message: 'Please enter an invoice number' },
    });
    expect(check).not.toHaveBeenCalled();
  });
  test('a new bill whose number already exists asks before overwriting', async () => {
    const check = exists(true);
    const plan = await planSave(session({ form: form({ invoiceNo: ' 012 ' }) }), shortcuts, check);
    expect(plan).toEqual({ kind: 'confirm-overwrite', invoiceNo: '012' });
    expect(check).toHaveBeenCalledWith('012');
  });
  test('a new bill with a free number saves directly', async () => {
    expect(await planSave(session(), shortcuts, exists(false))).toEqual({ kind: 'ready' });
  });
  test('re-saving the bill that was just saved or loaded does not ask', async () => {
    const check = exists(true);
    expect(await planSave(session({ saved: false, persistedNo: '012' }), shortcuts, check)).toEqual({
      kind: 'ready',
    });
    expect(check).not.toHaveBeenCalled();
  });
  test('changing the number after a save asks again', async () => {
    const check = exists(true);
    const plan = await planSave(session({ persistedNo: '011' }), shortcuts, check);
    expect(plan.kind).toBe('confirm-overwrite');
  });
  test('edit mode never asks', async () => {
    const check = exists(true);
    expect(await planSave(session({ editingNo: '012', persistedNo: '012' }), shortcuts, check)).toEqual({
      kind: 'ready',
    });
    expect(check).not.toHaveBeenCalled();
  });
});
describe('savedBillMessage', () => {
  test('matches the web toast body', () => {
    expect(savedBillMessage({ invoiceNo: '012', customerName: 'SLN TEX', grandTotal: 1234567.5 })).toBe(
      'Invoice #: 012\nCustomer: SLN TEX\nAmount: ₹12,34,567.50',
    );
  });
});
