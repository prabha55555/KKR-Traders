/**
 * Shapes shared by the generic history components (documentation only; the data layer builds them in
 * `../sales/salesModel.js` / `../purchase/purchaseModel.js`).
 *
 * PartyLabels      { party: 'Customer' | 'Supplier', formatInvoiceNo?: (no) => string }
 *
 * HistoryInvoice   { invoiceNo, invoiceDate, partyName, partyPhone, partyAddress,
 *                    products: [{ description, qty, rate }], subtotal, previousBalance, discountAmount,
 *                    grandTotal, amountPaid, balanceDue, paymentBreakdown, legacyPaymentMethod,
 *                    payments: HistoryPayment[], returns: HistoryReturn[], totalReturns, adjustedBalanceDue,
 *                    canAddPayment }
 *
 * HistoryPayment   { id, paymentDate, amount, paymentMethod, paymentType: 'initial' | 'additional', note }
 * HistoryReturn    { id, returnDate, description, qty, rate, returnAmount, reason }
 * DateGroup        { key: 'YYYY-MM-DD' | '', date: 'DD/MM/YYYY', invoices: HistoryInvoice[], totalInvoices }
 *
 * HistoryInvoiceActions – everything an invoice card / row / detail sheet can trigger. Every callback takes the
 * invoice number so the object can stay referentially stable (build it with useMemo):
 *   edit, remove, addPayment, addReturn, downloadStatement, shareStatement, viewPayments, viewReturns
 *   optional: open (row/card click -> detail sheet), printInvoice, shareInvoicePdf, whatsAppMessage
 * Optional entries are simply not rendered when missing.
 *
 * StatementState  { status: 'idle' | 'loading' | 'error' } | { status: 'empty', query } | { status: 'ready', statement }
 */
export {};
