/**
 * Shapes shared by the generic history components (documentation only; the data layer builds them in
 * `../sales/salesModel.js` / `../purchase/purchaseModel.js`).
 *
 * PartyLabels      { party: 'Customer' | 'Supplier', formatInvoiceNo?: (no) => string }
 *
 * HistoryInvoice   { invoiceNo, invoiceDate, partyName, partyPhone, partyAddress,
 *                    products: [{ description, qty, rolls?, rate, amount? }], subtotal, previousBalance, discountAmount,
 *                    grandTotal, billAmount (own amount, no carried balance), amountPaid, balanceDue,
 *                    paymentBreakdown ({ cash, account }), legacyPaymentMethod ('cash' | 'account'),
 *                    payments: HistoryPayment[], returns: HistoryReturn[],
 *                    totalReturns (all), balanceReturns (settled on the balance), refundedReturns,
 *                    adjustedBalanceDue (= balanceDue - balanceReturns), canAddPayment }
 *
 * HistoryPayment   { id, paymentDate, amount, paymentMethod: 'cash' | 'account', paymentType: 'initial' | 'additional',
 *                    bankAccountId?, note }
 * HistoryReturn    { id, returnDate, description, qty, rate, returnAmount, reason,
 *                    settlementType?: 'refund' | 'adjustment', refundMethod?: 'cash' | 'bank', bankAccountId? }
 *                    (no settlement fields = an older return that adjusted the balance)
 * DateGroup        { key: 'YYYY-MM-DD' | '', date: 'DD/MM/YYYY', invoices: HistoryInvoice[], totalInvoices }
 *
 * HistoryInvoiceActions – everything an invoice card / row / detail sheet can trigger. Every callback takes the
 * invoice number so the object can stay referentially stable (build it with useMemo):
 *   edit, remove, addPayment, addReturn, downloadStatement, shareStatement, viewPayments, viewReturns
 *   optional: open (the "Details" action of a row / card -> detail sheet), printInvoice, shareInvoicePdf,
 *   whatsAppMessage
 * Optional entries are simply not rendered when missing.
 *
 * StatementState  { status: 'idle' | 'loading' | 'error' } | { status: 'empty', query } |
 *                 { status: 'choose', query, parties } | { status: 'ready', statement }
 */
export {};
