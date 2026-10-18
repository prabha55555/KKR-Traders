import {
  CUSTOMER_MESSAGES,
  filterCustomers,
  hasErrors,
  isValidCustomerPhone,
  trimDraft,
  validateCustomerDraft,
} from '@/features/customerForm/customerValidation';
describe('customer form validation (manage-customers.js messages)', () => {
  const valid = { phone: '9876543210', name: 'SLN TEX', address: '' };
  test('a valid draft has no errors; address is optional', () => {
    expect(validateCustomerDraft(valid, 'add')).toEqual({});
    expect(validateCustomerDraft(valid, 'edit')).toEqual({});
    expect(hasErrors({})).toBe(false);
  });
  test('add: phone and name messages follow the web alerts', () => {
    expect(validateCustomerDraft({ phone: '12345', name: '', address: '' }, 'add')).toEqual({
      phone: 'Please enter a valid phone number (at least 10 digits).',
      name: 'Customer name is required.',
    });
  });
  test('edit: the shorter web messages are used', () => {
    expect(validateCustomerDraft({ phone: '', name: '', address: 'x' }, 'edit')).toEqual({
      phone: 'Please enter a valid phone number.',
      name: 'Name cannot be empty.',
    });
  });
  test('trimDraft makes whitespace-only names invalid', () => {
    const draft = trimDraft({ phone: ' 9876543210 ', name: '   ', address: '  Tirupur ' });
    expect(draft).toEqual({ phone: '9876543210', name: '', address: 'Tirupur' });
    expect(validateCustomerDraft(draft, 'add').name).toBe(CUSTOMER_MESSAGES.add.name);
  });
  test('phone needs 10 digits; separators and a country code are fine, letters are not', () => {
    expect(isValidCustomerPhone('9876543210')).toBe(true);
    expect(isValidCustomerPhone('+91 98765 43210')).toBe(true);
    expect(isValidCustomerPhone('98765-4321')).toBe(false);
    expect(isValidCustomerPhone('abcdefghijk')).toBe(false);
    expect(isValidCustomerPhone('')).toBe(false);
  });
  test('duplicate messages differ between add and edit like the web alerts', () => {
    expect(CUSTOMER_MESSAGES.add.duplicate).toBe('A customer with this phone number already exists.');
    expect(CUSTOMER_MESSAGES.edit.duplicate).toBe('A customer with the new phone number already exists.');
  });
});
describe('filterCustomers (search box)', () => {
  const customers = [
    { phone: '9876543210', name: 'SLN TEX', address: '1/1B East Extn, Tirupur' },
    { phone: '9000012345', name: 'Meena Stores', address: 'Palladam' },
    { phone: '9111111111', name: 'Kumar', address: '' },
  ];
  test('an empty or blank query returns the list untouched', () => {
    expect(filterCustomers(customers, '')).toBe(customers);
    expect(filterCustomers(customers, '   ')).toBe(customers);
  });
  test('matches name, address and phone case-insensitively', () => {
    expect(filterCustomers(customers, 'sln').map((c) => c.name)).toEqual(['SLN TEX']);
    expect(filterCustomers(customers, 'PALLADAM').map((c) => c.name)).toEqual(['Meena Stores']);
    expect(filterCustomers(customers, '90000').map((c) => c.name)).toEqual(['Meena Stores']);
  });
  test('phone-like queries ignore spaces and dashes', () => {
    expect(filterCustomers(customers, '98765 432').map((c) => c.name)).toEqual(['SLN TEX']);
    expect(filterCustomers(customers, '91111-11111').map((c) => c.name)).toEqual(['Kumar']);
  });
  test('no match -> empty list; customers with missing fields do not break the filter', () => {
    expect(filterCustomers(customers, 'zzz')).toEqual([]);
    const sparse = [{ phone: '9876543210' }, { name: 'No phone' }];
    expect(filterCustomers(sparse, 'phone').map((c) => c.name)).toEqual(['No phone']);
  });
});
