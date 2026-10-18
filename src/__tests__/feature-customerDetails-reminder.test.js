import { CREDIT_LINE } from '@/core/branding';
import { buildCustomerSummaries } from '@/features/customerDetails/aggregate';
import {
  balanceTone,
  formatCount,
  isAddressTruncated,
  isPhoneMasked,
  maskPhone,
  previewAddress,
  revealPhone,
} from '@/features/customerDetails/display';
import {
  canSendReminder,
  generateReminderMessage,
  messageStats,
  reminderBalance,
  withSignature,
} from '@/features/customerDetails/reminder';
import { buildStatTiles } from '@/features/customerDetails/statTiles';
import { computeStats } from '@/features/customerDetails/aggregate';
import { whatsAppUrl } from '@/core/services/whatsapp';
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
describe('canSendReminder (showWhatsApp = balance > 0 && phone)', () => {
  test('needs a positive balance AND a phone number', () => {
    expect(canSendReminder(customer())).toBe(true); // balance 819.75
    expect(canSendReminder(customer({ phone: '' }))).toBe(false);
    // paid in full
    expect(canSendReminder(customer({ amountPaid: 1500, totalReturns: 0, totalDiscountAmount: 0 }))).toBe(
      false,
    );
    // credit balance
    expect(canSendReminder(customer({ amountPaid: 2000, totalReturns: 0, totalDiscountAmount: 0 }))).toBe(
      false,
    );
  });
  test('the discount counts: a bill fully covered by payment + discount gets no reminder', () => {
    expect(
      canSendReminder(
        customer({
          totalCurrentBillAmount: 1000,
          amountPaid: 900,
          totalReturns: 0,
          totalDiscountAmount: 100,
        }),
      ),
    ).toBe(false);
  });
});
describe('reminder text', () => {
  test('standard template', () => {
    expect(generateReminderMessage(customer(), 'standard')).toBe(
      [
        'SANTHAMANI TEXTILES - Payment Reminder',
        '',
        'Dear Ravi,',
        '',
        'Your outstanding balance is: ₹819.75',
        '',
        'Please make the payment at your earliest convenience.',
        '',
        'This is an automated reminder',
      ].join('\n'),
    );
  });
  test('urgent template', () => {
    expect(generateReminderMessage(customer(), 'urgent')).toBe(
      [
        'SANTHAMANI TEXTILES - URGENT: Payment Required',
        '',
        'Dear Ravi,',
        '',
        'URGENT: Your payment of ₹819.75 is overdue.',
        '',
        'Please clear the outstanding amount immediately to avoid any inconvenience.',
        '',
        '*Urgent - Please respond immediately*',
      ].join('\n'),
    );
  });
  test('friendly template', () => {
    expect(generateReminderMessage(customer(), 'friendly')).toBe(
      [
        'SANTHAMANI TEXTILES - Friendly Payment Follow-up',
        '',
        'Hi Ravi,',
        '',
        "Hope you're doing well! This is a friendly reminder about your outstanding balance of ₹819.75.",
        '',
        'Please let us know if you have any questions or need more time.',
        '',
        'Best regards,',
        'SANTHAMANI TEXTILES Team',
      ].join('\n'),
    );
  });
  test('amount uses Indian grouping with two decimals', () => {
    const big = customer({
      totalCurrentBillAmount: 1234567.5,
      amountPaid: 0,
      totalReturns: 0,
      totalDiscountAmount: 0,
    });
    expect(generateReminderMessage(big, 'standard')).toContain('₹12,34,567.50');
  });
  test('the quoted balance subtracts the discount, matching the list (web dialog forgot to)', () => {
    const c = customer({
      totalCurrentBillAmount: 1000,
      amountPaid: 0,
      totalReturns: 0,
      totalDiscountAmount: 100,
    });
    expect(reminderBalance(c)).toBe(900);
    expect(generateReminderMessage(c, 'standard')).toContain('₹900.00');
  });
  test('the developer credit is appended to the sent text after a blank line', () => {
    expect(withSignature('Hello')).toBe(`Hello\n\n${CREDIT_LINE}`);
  });
  test('counters: characters and 160-character message segments', () => {
    expect(messageStats('')).toEqual({ characters: 0, messages: 0 });
    expect(messageStats('a'.repeat(160))).toEqual({ characters: 160, messages: 1 });
    expect(messageStats('a'.repeat(161))).toEqual({ characters: 161, messages: 2 });
  });
});
describe('WhatsApp phone handling (shared service)', () => {
  test('digits only; bare 10-digit numbers get the 91 country code', () => {
    expect(whatsAppUrl('98765 43210', 'Hi there')).toBe('https://wa.me/919876543210?text=Hi%20there');
    expect(whatsAppUrl('+91 98765-43210')).toBe('https://wa.me/919876543210');
  });
});
describe('list display helpers', () => {
  test('maskPhone keeps the last 3 digits of the digits-only number', () => {
    expect(maskPhone('9876543210')).toBe('*******210');
    expect(maskPhone('98 765-43210')).toBe('*******210');
    expect(maskPhone('12')).toBe('12');
    expect(maskPhone('')).toBe('N/A');
    expect(maskPhone(undefined)).toBe('N/A');
  });
  test('revealPhone shows the digits only; short numbers cannot be revealed', () => {
    expect(revealPhone('98765-43210')).toBe('9876543210');
    expect(isPhoneMasked('9876543210')).toBe(true);
    expect(isPhoneMasked('123')).toBe(false);
    expect(isPhoneMasked('')).toBe(false);
  });
  test('previewAddress truncates after 30 characters', () => {
    const exactly30 = 'a'.repeat(30);
    expect(previewAddress(exactly30)).toBe(exactly30);
    expect(isAddressTruncated(exactly30)).toBe(false);
    expect(previewAddress('b'.repeat(31))).toBe(`${'b'.repeat(30)}...`);
    expect(isAddressTruncated('b'.repeat(31))).toBe(true);
    expect(previewAddress('')).toBe('N/A');
  });
  test('balanceTone: owing = negative (red), credit = positive (green)', () => {
    expect(balanceTone(0.01)).toBe('negative');
    expect(balanceTone(-5)).toBe('positive');
    expect(balanceTone(0)).toBe('neutral');
  });
  test('formatCount groups in lakhs', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234)).toBe('1,234');
    expect(formatCount(123456)).toBe('1,23,456');
  });
});
describe('stat tiles', () => {
  const invoices = [
    {
      invoiceNo: '1',
      invoiceDate: '2026-01-01',
      customerName: 'Big',
      customerAddress: '',
      customerPhone: '',
      products: [],
      subtotal: 11500000,
      previousBalance: 0,
      grandTotal: 11500000,
      amountPaid: 150000,
      discountAmount: 500,
      balanceDue: 0,
    },
  ];
  test('six cards in web order; amount-in-words hint only for Total Amount / Paid / Balance', () => {
    const tiles = buildStatTiles(computeStats(buildCustomerSummaries(invoices, [])));
    expect(tiles.map((t) => [t.label, t.value, t.hint])).toEqual([
      ['Total Customers', '1', undefined],
      ['Total Invoices', '1', undefined],
      ['Total Amount', '₹1,15,00,000.00', '(1.15 Cr)'],
      ['Total Paid', '₹1,50,000.00', '(1.50 L)'],
      ['Total Discount', '₹500.00', undefined],
      ['Total Balance', '₹1,13,49,500.00', '(1.13 Cr)'],
    ]);
  });
  test('"Total Returns" card appears only when there are returns, just before Total Balance, shown negative', () => {
    const returns = [
      {
        id: 'r',
        invoiceNo: '1',
        returnDate: '2026-01-02',
        description: 'x',
        qty: 1,
        rate: 1,
        returnAmount: 2500,
      },
    ];
    const tiles = buildStatTiles(computeStats(buildCustomerSummaries(invoices, returns)));
    expect(tiles.map((t) => t.label)).toEqual([
      'Total Customers',
      'Total Invoices',
      'Total Amount',
      'Total Paid',
      'Total Discount',
      'Total Returns',
      'Total Balance',
    ]);
    const tile = tiles.find((t) => t.key === 'returns');
    expect(tile.value).toBe('-₹2,500.00');
    expect(tile.hint).toBe('(2.50 K)');
    // app status colour of returns everywhere (amber)
    expect(tile.tone).toBe('warning');
  });
  test('Total Balance colour follows the sign', () => {
    const tone = (balance) =>
      buildStatTiles({
        totalCustomers: 1,
        totalInvoices: 1,
        totalCurrentBillAmount: 0,
        totalPaid: 0,
        totalReturns: 0,
        totalDiscountAmount: 0,
        pendingBalance: balance,
      }).find((t) => t.key === 'balance').tone;
    // StatCard / Badge tones: owed = red, credit = green, nil = grey
    expect(tone(10)).toBe('danger');
    expect(tone(-10)).toBe('success');
    expect(tone(0)).toBe('neutral');
  });
});
