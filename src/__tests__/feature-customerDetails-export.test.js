import { buildCustomerSummaries } from '@/features/customerDetails/aggregate';
import { buildCsv, buildExport, buildJson, exportFileName } from '@/features/customerDetails/exportData';
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
const INVOICES = [
  inv({
    invoiceNo: '12',
    invoiceDate: '2026-10-03',
    customerName: 'Ravi "RS" Textiles',
    customerPhone: '9876543210',
    customerAddress: 'Gandhi Road, "Tirupur"',
    subtotal: 1000,
    discountAmount: 50,
    amountPaid: 400,
  }),
  inv({ invoiceNo: '11', invoiceDate: '2026-09-20', customerName: 'Ravi "RS" Textiles', subtotal: 500 }),
  inv({
    invoiceNo: '5',
    invoiceDate: '2026-09-15',
    customerName: 'Meena',
    subtotal: 250.5,
    amountPaid: 250.5,
  }),
  // no invoiceNo, no date -> "N/A" in the last-invoice columns
  inv({ invoiceNo: '', invoiceDate: '', customerName: 'Kumar', subtotal: 800, amountPaid: 100 }),
];
const RETURNS = [
  {
    id: 'a',
    invoiceNo: '12',
    returnDate: '2026-10-04',
    description: 'x',
    qty: 1,
    rate: 1,
    returnAmount: 30.25,
  },
  {
    id: 'b',
    invoiceNo: '11',
    returnDate: '2026-10-04',
    description: 'x',
    qty: 1,
    rate: 1,
    returnAmount: 200,
  },
];
const customers = buildCustomerSummaries(INVOICES, RETURNS);
const ALL = ['phone', 'address', 'invoices', 'returns'];
describe('buildCsv', () => {
  test('all columns: header, quoting, raw numbers, Indian-format last invoice date, N/A fallbacks', () => {
    expect(buildCsv(customers, ALL)).toBe(
      [
        'Customer Name,Phone,Address,Total Invoices,Total Amount,Amount Paid,Returns,Balance Due,Last Invoice,Last Invoice Date',
        // Ravi: 1500 bill - 400 paid - 230.25 returns - 50 discount = 819.75 ; quotes doubled inside quoted fields
        '"Ravi ""RS"" Textiles","9876543210","Gandhi Road, ""Tirupur""",2,1500,400,230.25,819.75,12,3/10/2026',
        '"Meena","N/A","N/A",1,250.5,250.5,0,0,5,15/9/2026',
        '"Kumar","N/A","N/A",1,800,100,0,700,N/A,N/A',
        '',
      ].join('\n'),
    );
  });
  test('unticked columns are dropped; the Discount column never exists; "invoices" has no effect on CSV', () => {
    expect(buildCsv(customers, [])).toBe(
      [
        'Customer Name,Total Invoices,Total Amount,Amount Paid,Balance Due,Last Invoice,Last Invoice Date',
        '"Ravi ""RS"" Textiles",2,1500,400,819.75,12,3/10/2026',
        '"Meena",1,250.5,250.5,0,5,15/9/2026',
        '"Kumar",1,800,100,700,N/A,N/A',
        '',
      ].join('\n'),
    );
    expect(buildCsv(customers, ['invoices'])).toBe(buildCsv(customers, []));
  });
  test('only Returns ticked', () => {
    const csv = buildCsv(customers.slice(2), ['returns']);
    expect(csv).toBe(
      'Customer Name,Total Invoices,Total Amount,Amount Paid,Returns,Balance Due,Last Invoice,Last Invoice Date\n"Kumar",1,800,100,0,700,N/A,N/A\n',
    );
  });
  test('empty list -> header only', () => {
    expect(buildCsv([], ALL)).toBe(
      'Customer Name,Phone,Address,Total Invoices,Total Amount,Amount Paid,Returns,Balance Due,Last Invoice,Last Invoice Date\n',
    );
  });
});
describe('buildJson', () => {
  test('all columns, 2-space indented, totalAmount = bill amounts and balanceDue includes returns + discount', () => {
    const parsed = JSON.parse(buildJson(customers, ALL));
    expect(parsed[0]).toEqual({
      name: 'Ravi "RS" Textiles',
      totalInvoices: 2,
      totalAmount: 1500,
      amountPaid: 400,
      balanceDue: 819.75,
      lastInvoiceNo: '12',
      lastInvoiceDate: '2026-10-03',
      phone: '9876543210',
      address: 'Gandhi Road, "Tirupur"',
      returns: 230.25,
      invoiceNumbers: ['12', '11'],
    });
    expect(buildJson(customers, ALL)).toContain('\n  {\n    "name"');
  });
  test('key order follows the web page and missing last-invoice info is omitted', () => {
    const json = buildJson(customers.slice(2), ['phone']);
    expect(JSON.parse(json)).toEqual([
      { name: 'Kumar', totalInvoices: 1, totalAmount: 800, amountPaid: 100, balanceDue: 700, phone: '' },
    ]);
    expect(Object.keys(JSON.parse(buildJson(customers.slice(0, 1), ALL))[0])).toEqual([
      'name',
      'totalInvoices',
      'totalAmount',
      'amountPaid',
      'balanceDue',
      'lastInvoiceNo',
      'lastInvoiceDate',
      'phone',
      'address',
      'returns',
      'invoiceNumbers',
    ]);
  });
});
describe('file naming / packaging', () => {
  test('PR_Fabrics_Customers_<date>.<ext>', () => {
    expect(exportFileName('csv', '2026-10-03')).toBe('PR_Fabrics_Customers_2026-10-03.csv');
    expect(exportFileName('json', '2026-10-03')).toBe('PR_Fabrics_Customers_2026-10-03.json');
  });
  test('buildExport picks mime type and content by format', () => {
    const csv = buildExport(customers, 'csv', ALL, '2026-10-03');
    expect(csv).toMatchObject({ fileName: 'PR_Fabrics_Customers_2026-10-03.csv', mimeType: 'text/csv' });
    expect(csv.content).toBe(buildCsv(customers, ALL));
    const json = buildExport(customers, 'json', ALL, '2026-10-03');
    expect(json).toMatchObject({
      fileName: 'PR_Fabrics_Customers_2026-10-03.json',
      mimeType: 'application/json',
    });
    expect(json.content).toBe(buildJson(customers, ALL));
  });
});
