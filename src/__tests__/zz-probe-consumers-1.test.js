import { describe, test, expect } from 'vitest';
import { computeLedger, PURCHASE_LEDGER, SALES_LEDGER, returnsTotalsByInvoice, salesLedgerChanges, purchaseLedgerChanges, previousBalanceAt } from '@/core/ledger';
import { aggregateSuppliers, supplierStats } from '@/features/purchase/supplierDetails';
import { buildCustomerSummaries, customerBalance } from '@/features/customerDetails/aggregate';
import { computeAnalytics } from '@/features/overview/revenue/dashboardAnalytics';
import { buildCombinedStatement } from '@/features/history/lib/statement';
import { toHistoryInvoice } from '@/features/history/sales/salesModel';

const apply = (rows, changesFn) => rows.map((r) => ({ ...r.bill, ...(changesFn(r) || {}) })).map((b) => {
  const out = { ...b };
  if (out['payment.balanceDue'] !== undefined) {
    out.payment = { ...out.payment, balanceDue: out['payment.balanceDue'] };
    delete out['payment.balanceDue'];
  }
  return out;
});

describe('probe consumers', () => {
  test('supplier details sums running balances after purchase sync', () => {
    // three purchase bills created on the purchase screen (old: carried 0), each 1000, unpaid
    const bills = ['001', '002', '003'].map((n, i) => ({
      invoiceNo: n,
      invoiceDate: `2026-05-0${i + 1}`,
      supplierName: 'ABC',
      supplierPhone: '9000000000',
      subtotal: 1000,
      previousBalance: 0,
      grandTotal: 1000,
      payment: { cash: 0, upi: 0, account: 0, totalPaid: 0, balanceDue: 1000 },
      products: [{ description: 'x', qty: 1, rate: 1000, amount: 1000 }],
    }));
    const before = aggregateSuppliers(bills, []);
    const rows = computeLedger(bills, PURCHASE_LEDGER);
    const synced = apply(rows, purchaseLedgerChanges);
    const after = aggregateSuppliers(synced, []);
    console.log('before', before[0].balanceDue, before[0].totalAmount, 'after', after[0].balanceDue, after[0].totalAmount, 'ledger closing', rows[2].closingBalance);
    const prev = previousBalanceAt(synced, PURCHASE_LEDGER, { invoiceNo: '004', invoiceDate: '2026-05-10' });
    console.log('purchase bill screen prev for next bill', prev.previousBalance, 'totalPreviousBills', prev.totalPreviousBills);
    const dash = computeAnalytics({ salesBills: [], purchaseBills: synced, salesReturns: [], purchaseReturns: [], expenses: [] }, 'all');
    console.log('dashboard purchasesAmount', dash.current.purchasesAmount, 'suppliersOutstanding', dash.suppliersOutstanding);
    expect(after[0].balanceDue).not.toBe(rows[2].closingBalance);
  });

  test('customer details + dashboard double-subtract earlier returns', () => {
    const inv = [
      { invoiceNo: '001', invoiceDate: '2026-05-01', customerName: 'C', customerPhone: '1', subtotal: 1000, previousBalance: 500, amountPaid: 0, discountAmount: 0 },
      { invoiceNo: '002', invoiceDate: '2026-05-02', customerName: 'C', customerPhone: '1', subtotal: 1000, previousBalance: 0, amountPaid: 0, discountAmount: 0 },
    ];
    const returns = [{ invoiceNo: '001', returnAmount: 200 }];
    const rows = computeLedger(inv, SALES_LEDGER, { returnsByInvoice: returnsTotalsByInvoice(returns) });
    const synced = apply(rows, salesLedgerChanges);
    const ledgerBalance = rows[1].closingBalance;
    const summaries = buildCustomerSummaries(synced, returns);
    const cd = customerBalance(summaries[0]);
    const dash = computeAnalytics({ salesBills: synced, purchaseBills: [], salesReturns: returns, purchaseReturns: [], expenses: [] }, 'all');
    console.log('ledger', ledgerBalance, 'customerDetails', cd, 'dashboard', dash.customerOutstanding);
    expect(cd).not.toBe(ledgerBalance);
  });

  test('same-day bills: customer details picks older bill', () => {
    const inv = [
      { invoiceNo: '001', invoiceDate: '2026-05-01', customerName: 'C', customerPhone: '1', subtotal: 1000, previousBalance: 500, amountPaid: 0 },
      { invoiceNo: '002', invoiceDate: '2026-05-01', customerName: 'C', customerPhone: '1', subtotal: 300, previousBalance: 0, amountPaid: 0 },
    ];
    const rows = computeLedger(inv, SALES_LEDGER);
    const synced = apply(rows, salesLedgerChanges);
    const s = buildCustomerSummaries(synced, []);
    console.log('same-day ledger', rows[1].closingBalance, 'customerDetails', customerBalance(s[0]));
  });

  test('combined statement latest by number vs ledger by date', () => {
    // #012 back-dated to May 1, #011 on May 5
    const inv = [
      { invoiceNo: '011', invoiceDate: '2026-05-05', customerName: 'C', customerPhone: '1', subtotal: 1000, previousBalance: 0, amountPaid: 0, products: [] },
      { invoiceNo: '012', invoiceDate: '2026-05-01', customerName: 'C', customerPhone: '1', subtotal: 300, previousBalance: 0, amountPaid: 0, products: [] },
    ];
    const rows = computeLedger(inv, SALES_LEDGER);
    const synced = apply(rows, salesLedgerChanges);
    const views = synced.map((i) => ({ ...toHistoryInvoice(i, [], [], false), partyName: 'C' }));
    const st = buildCombinedStatement('C', views);
    console.log('ledger latest', rows[rows.length - 1].bill.invoiceNo, rows[rows.length - 1].closingBalance, 'statement', st.mostRecent.invoiceNo, st.totals.adjustedBalanceDue);
  });
});
