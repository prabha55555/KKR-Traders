import { db } from '@/core/db';
import { purchaseBalanceDue } from '@/core/billing';
import {
  addSupplier,
  filterSupplierDirectory,
  planSupplierEdit,
  updateSupplier,
  validateNewSupplier,
  validateSupplierEdit,
} from '@/features/purchase/supplierAdmin';
import {
  aggregateSuppliers,
  buildSuppliersCsv,
  filterSuppliers,
  maskPhone,
  revealedPhone,
  supplierStats,
  suppliersCsvFileName,
} from '@/features/purchase/supplierDetails';
const bill = (over) => ({
  invoiceNo: '001',
  invoiceDate: '2026-10-01',
  supplierName: 'ABC Mills',
  supplierPhone: '9000000001',
  supplierAddress: 'Coimbatore',
  products: [],
  subtotal: 0,
  grandTotal: 0,
  ...over,
});
afterEach(() => jest.restoreAllMocks());
// getAllPurchaseBills returns newest first; stored the way the ledger sync leaves them (carried balances)
const bills = [
  bill({
    invoiceNo: 'P-12',
    invoiceDate: '2026-10-05',
    supplierName: ' ABC Mills ',
    subtotal: 1000,
    previousBalance: 60,
    discount: 50,
    grandTotal: 1010,
    payment: { cash: 300, account: 100, totalPaid: 400, balanceDue: 610 },
  }),
  bill({
    invoiceNo: '9',
    invoiceDate: '2026-09-01',
    supplierAddress: 'Old address',
    subtotal: 500,
    grandTotal: 500,
    amountPaid: 500,
    balanceDue: 0,
  }),
  bill({
    invoiceNo: '003',
    supplierName: 'XYZ Tex',
    supplierPhone: '9222222222',
    supplierAddress: '',
    subtotal: 200,
    grandTotal: 200,
    payment: { cash: 0, upi: 0, account: 0, totalPaid: 0, balanceDue: 200 },
  }),
  bill({ invoiceNo: '055', supplierName: '', supplierPhone: '', subtotal: 999, grandTotal: 999 }),
  bill({
    invoiceNo: '020',
    invoiceDate: '2026-09-20',
    subtotal: 100,
    grandTotal: 100,
    amountPaid: 40,
    balanceDue: 60,
    payment: { cash: 40, upi: 0, account: 0, totalPaid: 40, balanceDue: 60 },
  }),
];
const unpaid = (over) => bill({ payment: { cash: 0, account: 0, totalPaid: 0 }, ...over });
describe('aggregateSuppliers (processSupplierData on the supplier ledger)', () => {
  const result = aggregateSuppliers(bills);
  test('groups by ledger party, skips bills without a name and a phone, sorts by name', () => {
    expect(result.map((s) => s.name)).toEqual(['ABC Mills', 'XYZ Tex']);
    expect(result.map((s) => s.key)).toEqual(['p:9000000001', 'p:9222222222']);
  });
  test("amount = the bills' own amounts, paid = stored paid, balance = ledger closing of the latest bill", () => {
    const abc = result[0];
    expect(abc.totalBills).toBe(3);
    expect(abc.totalAmount).toBe(1550); // 500 + 100 + (1000 - 50): no carried balance
    expect(abc.totalPaid).toBe(940); // top-level 500 + nested 40 + nested 400
    expect(abc.totalDiscount).toBe(50);
    expect(abc.openingBalance).toBe(0);
    expect(abc.balanceDue).toBe(610); // 0 -> 60 -> 610 (not 0 + 60 + 610)
    expect(abc.lastInvoiceDate).toBe('2026-10-05');
    expect(result[1]).toMatchObject({ totalBills: 1, totalAmount: 200, totalPaid: 0, balanceDue: 200 });
  });
  test('phone/address come from the latest bill (address falls back to older bills)', () => {
    expect(result[0].phone).toBe('9000000001');
    expect(result[0].address).toBe('Coimbatore');
  });
  test('invoice numbers: P- stripped, zero padded, newest number first', () => {
    expect(result[0].invoiceNos).toEqual(['020', '012', '009']);
    expect(result[0].allInvoiceNumbers).toEqual(['020', '012', '009']);
  });
  test('tolerates garbage input', () => {
    expect(aggregateSuppliers(null)).toEqual([]);
    expect(aggregateSuppliers(undefined)).toEqual([]);
    expect(aggregateSuppliers([null, bill({ supplierName: undefined, supplierPhone: '' })])).toEqual([]);
  });
  test('carried balances are counted once and an advance stays negative (no floor at 0)', () => {
    // P-1 1000 unpaid, P-2 500 unpaid, P-3 200 paid 2000: stored balanceDue 1000, 1500, -300
    const mill = [
      bill({
        invoiceNo: 'P-3',
        invoiceDate: '2026-10-03',
        supplierName: 'Mill',
        subtotal: 200,
        previousBalance: 1500,
        grandTotal: 1700,
        payment: { cash: 2000, account: 0, totalPaid: 2000, balanceDue: -300 },
      }),
      unpaid({
        invoiceNo: 'P-2',
        invoiceDate: '2026-10-02',
        supplierName: 'Mill',
        subtotal: 500,
        previousBalance: 1000,
        grandTotal: 1500,
      }),
      unpaid({
        invoiceNo: 'P-1',
        invoiceDate: '2026-10-01',
        supplierName: 'Mill',
        subtotal: 1000,
        grandTotal: 1000,
      }),
    ];
    const [s] = aggregateSuppliers(mill);
    expect(s.totalAmount).toBe(1700);
    expect(s.balanceDue).toBe(-300);
    expect(supplierStats([s]).totalBalance).toBe(-300);
  });
  test('only balance-settled returns lower the balance; refunds are still listed as returns', () => {
    const one = [unpaid({ invoiceNo: '001', subtotal: 1000, grandTotal: 1000 })];
    const returns = [
      { invoiceNo: '001', returnAmount: 100 }, // legacy: settled on the balance
      { invoiceNo: '001', returnAmount: 300, settlementType: 'refund', refundMethod: 'cash' },
    ];
    expect(aggregateSuppliers(one, returns)[0]).toMatchObject({ totalReturns: 400, balanceDue: 900 });
  });
  test("opening balance is the ledger opening; a bill's opening-balance entry is part of its amount", () => {
    const opened = [
      unpaid({
        invoiceNo: '001',
        subtotal: 100,
        previousBalance: 250,
        manualPreviousBalance: 30,
        grandTotal: 380,
      }),
    ];
    const [s] = aggregateSuppliers(opened);
    expect(s.openingBalance).toBe(250);
    expect(s.totalAmount).toBe(130);
    expect(s.balanceDue).toBe(380); // 250 + 130 - 0
  });
  test('same name with different phones = two suppliers; same phone typed differently = one', () => {
    const list = aggregateSuppliers([
      unpaid({ invoiceNo: '001', supplierName: 'Ravi', supplierPhone: '9000000001', subtotal: 100 }),
      unpaid({ invoiceNo: '002', supplierName: 'Ravi', supplierPhone: '9000000002', subtotal: 100 }),
      unpaid({
        invoiceNo: '003',
        invoiceDate: '2026-10-02',
        supplierName: 'ravi ',
        supplierPhone: '+91 90000 00001',
        subtotal: 50,
      }),
    ]);
    expect(list.map((s) => [s.phone, s.totalBills, s.balanceDue])).toEqual([
      ['+91 90000 00001', 2, 150],
      ['9000000002', 1, 100],
    ]);
  });
  test('directory suppliers without bills are listed with zeros; ones with bills are not duplicated', () => {
    const list = aggregateSuppliers(
      bills,
      [],
      [
        { phone: '9000000001', name: 'ABC Mills', address: 'X' },
        { phone: '9333333333', name: 'New Supplier', address: 'Erode' },
        { phone: '', name: '  ' },
      ],
    );
    expect(list.map((s) => s.name)).toEqual(['ABC Mills', 'New Supplier', 'XYZ Tex']);
    expect(list[1]).toMatchObject({ key: 'p:9333333333', totalBills: 0, balanceDue: 0, address: 'Erode' });
  });
  test('a directory supplier joins the phone-less bills of its name', () => {
    const list = aggregateSuppliers(
      [unpaid({ supplierName: 'Old Mill', supplierPhone: '', subtotal: 100 })],
      [],
      [{ phone: '9444444444', name: 'Old Mill', address: 'Salem' }],
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ phone: '9444444444', address: 'Coimbatore', balanceDue: 100 });
  });
  test('legacy: a nested balanceDue of 0 with a stale top-level field follows the stored paid amount', () => {
    const stale = bill({
      subtotal: 100,
      grandTotal: 100,
      balanceDue: 70,
      payment: { cash: 100, upi: 0, account: 0, totalPaid: 100, balanceDue: 0 },
    });
    expect(aggregateSuppliers([stale])[0].balanceDue).toBe(0);
    expect(purchaseBalanceDue(stale)).toBe(0);
  });
});
describe('supplierStats', () => {
  test('totals over all suppliers', () => {
    expect(supplierStats(aggregateSuppliers(bills))).toEqual({
      totalSuppliers: 2,
      totalBills: 4,
      totalAmount: 1750,
      totalPaid: 940,
      totalDiscount: 50,
      totalBalance: 810,
    });
  });
  test('empty list', () => {
    expect(supplierStats([])).toEqual({
      totalSuppliers: 0,
      totalBills: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalDiscount: 0,
      totalBalance: 0,
    });
  });
});
describe('filterSuppliers (doSearch)', () => {
  const suppliers = aggregateSuppliers(bills);
  test('matches name, phone or address, case-insensitively', () => {
    expect(filterSuppliers(suppliers, 'abc').map((s) => s.name)).toEqual(['ABC Mills']);
    expect(filterSuppliers(suppliers, '90000').map((s) => s.name)).toEqual(['ABC Mills']);
    expect(filterSuppliers(suppliers, 'COIMB').map((s) => s.name)).toEqual(['ABC Mills']);
    expect(filterSuppliers(suppliers, 'nothing')).toEqual([]);
  });
  test('blank query returns everything', () => {
    expect(filterSuppliers(suppliers, '  ')).toBe(suppliers);
  });
});
describe('phone masking', () => {
  test('masks all but the last three digits', () => {
    expect(maskPhone('9876543210')).toBe('*******210');
    expect(maskPhone('+91 98765-43210')).toBe('*********210');
    expect(maskPhone('98')).toBe('98');
    expect(maskPhone('')).toBe('N/A');
  });
  test('tapping reveals the digits', () => {
    expect(revealedPhone('+91 98765-43210')).toBe('919876543210');
  });
});
describe('buildSuppliersCsv (exportCSV)', () => {
  test('header, quoted cells, 2-decimal amounts and invoice list', () => {
    const csv = buildSuppliersCsv([
      {
        name: 'Bob "The" Mills',
        phone: '9000000001',
        address: 'Tirupur, TN',
        totalBills: 2,
        totalAmount: 1650,
        totalPaid: 940.5,
        totalDiscount: 50,
        balanceDue: 709.5,
        invoiceNos: ['020', '012'],
      },
    ]);
    expect(csv.split('\n')).toEqual([
      '"Supplier Name","Phone","Address","Total Bills","Total Amount","Amount Paid","Discount","Balance Due","Invoice Nos"',
      '"Bob ""The"" Mills","9000000001","Tirupur, TN","2","1650.00","940.50","50.00","709.50","020; 012"',
    ]);
  });
  test('file name', () => {
    expect(suppliersCsvFileName('2026-10-03')).toBe('supplier-details-2026-10-03.csv');
  });
});
// ------------------------------------------------------------------ Add Supplier
describe('supplier validation (manage-suppliers.js messages and order)', () => {
  test('add: phone needs 10+ characters, then a name', () => {
    expect(validateNewSupplier({ phone: '12345', name: 'A', address: '' })).toBe(
      'Please enter a valid phone number (at least 10 digits).',
    );
    expect(validateNewSupplier({ phone: '  ', name: '', address: '' })).toBe(
      'Please enter a valid phone number (at least 10 digits).',
    );
    expect(validateNewSupplier({ phone: '9000000001', name: '  ', address: '' })).toBe(
      'Supplier name is required.',
    );
    expect(validateNewSupplier({ phone: ' 9000000001 ', name: 'ABC', address: '' })).toBeNull();
  });
  test('edit: name first, then phone', () => {
    expect(validateSupplierEdit({ phone: '1', name: '', address: '' })).toBe('Name cannot be empty.');
    expect(validateSupplierEdit({ phone: '1', name: 'ABC', address: '' })).toBe(
      'Please enter a valid phone number.',
    );
    expect(validateSupplierEdit({ phone: '9000000001', name: 'ABC', address: '' })).toBeNull();
  });
});
describe('filterSupplierDirectory', () => {
  const list = [
    { phone: '9000000001', name: 'ABC Mills', address: 'Coimbatore' },
    { phone: '9000000002', name: 'Zed', address: '' },
  ];
  test('searches name, phone and address', () => {
    expect(filterSupplierDirectory(list, 'mills')).toEqual([list[0]]);
    expect(filterSupplierDirectory(list, '0002')).toEqual([list[1]]);
    expect(filterSupplierDirectory(list, 'coim')).toEqual([list[0]]);
    expect(filterSupplierDirectory(list, '')).toBe(list);
  });
});
describe('planSupplierEdit', () => {
  const original = { phone: '9000000001', name: 'ABC Mills', address: 'Coimbatore' };
  const all = [
    bill({ invoiceNo: '001', supplierName: 'ABC Mills', supplierAddress: 'Old address' }),
    bill({ invoiceNo: '002', supplierName: ' ABC Mills ', supplierAddress: '' }),
    bill({ invoiceNo: '003', supplierName: 'Other', supplierPhone: '9000000001' }),
  ];
  test('rewrites every bill carrying the old NAME (not phone) with the new details', () => {
    const plan = planSupplierEdit(
      original,
      { phone: '9555555555', name: 'ABC Textiles', address: 'Tirupur' },
      all,
    );
    expect(plan.phoneChanged).toBe(true);
    expect(plan.billUpdates).toEqual([
      {
        invoiceNo: '001',
        fields: { supplierName: 'ABC Textiles', supplierPhone: '9555555555', supplierAddress: 'Tirupur' },
      },
      {
        invoiceNo: '002',
        fields: { supplierName: 'ABC Textiles', supplierPhone: '9555555555', supplierAddress: 'Tirupur' },
      },
    ]);
  });
  test("a blank new address keeps each bill's own address", () => {
    const plan = planSupplierEdit(original, { phone: '9000000001', name: 'ABC Mills', address: '' }, all);
    expect(plan.phoneChanged).toBe(false);
    expect(plan.billUpdates.map((u) => u.fields.supplierAddress)).toEqual(['Old address', '']);
  });
});
describe('updateSupplier / addSupplier (db orchestration)', () => {
  const original = { phone: '9000000001', name: 'ABC Mills', address: 'Coimbatore' };
  function stub(existingNewPhone = null) {
    const calls = [];
    jest.spyOn(db, 'getSupplier').mockImplementation(async (phone) => {
      calls.push(`get:${phone}`);
      return existingNewPhone;
    });
    jest
      .spyOn(db, 'getAllPurchaseBills')
      .mockResolvedValue([
        bill({ invoiceNo: '001', supplierName: 'ABC Mills' }),
        bill({ invoiceNo: '002', supplierName: 'Other' }),
      ]);
    jest.spyOn(db, 'updatePurchaseBillFields').mockImplementation(async (no, data) => {
      calls.push(`bill:${no}:${data.supplierName}:${data.supplierPhone}`);
    });
    jest.spyOn(db, 'saveSupplier').mockImplementation(async (s) => {
      calls.push(`save:${s.phone}:${s.name}`);
      return s.phone;
    });
    jest.spyOn(db, 'deleteSupplier').mockImplementation(async (phone) => {
      calls.push(`delete:${phone}`);
    });
    return calls;
  }
  test('phone change: duplicate check, bills, new document, then the old document is deleted', async () => {
    const calls = stub();
    const result = await updateSupplier(original, {
      phone: ' 9555555555 ',
      name: 'ABC Textiles ',
      address: 'Tirupur',
    });
    expect(result).toEqual({ status: 'updated', billsUpdated: 1 });
    expect(calls).toEqual([
      'get:9555555555',
      'bill:001:ABC Textiles:9555555555',
      'save:9555555555:ABC Textiles',
      'delete:9000000001',
    ]);
  });
  test('a taken new phone aborts before anything is written', async () => {
    const calls = stub({ phone: '9555555555', name: 'Someone', address: '' });
    expect(await updateSupplier(original, { phone: '9555555555', name: 'ABC', address: '' })).toEqual({
      status: 'duplicate',
    });
    expect(calls).toEqual(['get:9555555555']);
  });
  test('same phone: no duplicate check and no delete', async () => {
    const calls = stub();
    await updateSupplier(original, { phone: '9000000001', name: 'ABC Mills Ltd', address: 'X' });
    expect(calls).toEqual(['bill:001:ABC Mills Ltd:9000000001', 'save:9000000001:ABC Mills Ltd']);
  });
  test('failing to delete the old document is not fatal', async () => {
    stub();
    jest.spyOn(db, 'deleteSupplier').mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      updateSupplier(original, { phone: '9555555555', name: 'ABC', address: '' }),
    ).resolves.toMatchObject({
      status: 'updated',
    });
  });
  test('addSupplier refuses an existing phone, otherwise saves phone/name/address only', async () => {
    const save = jest.spyOn(db, 'saveSupplier').mockResolvedValue('9000000001');
    jest.spyOn(db, 'getSupplier').mockResolvedValueOnce({ phone: '9000000001', name: 'x', address: '' });
    expect(await addSupplier({ phone: '9000000001', name: 'ABC', address: '' })).toBe('duplicate');
    expect(save).not.toHaveBeenCalled();
    jest.spyOn(db, 'getSupplier').mockResolvedValueOnce(null);
    expect(await addSupplier({ phone: ' 9000000001', name: ' ABC ', address: ' Tirupur ' })).toBe('added');
    expect(save).toHaveBeenCalledWith({ phone: '9000000001', name: 'ABC', address: 'Tirupur' });
  });
});
