/**
 * Firestore document shapes (documentation only — JSDoc typedefs, no runtime code).
 *
 * These mirror the documents written by the original web app. The React app shares the same Firestore project,
 * so field names / semantics MUST stay identical. Many fields are optional because older documents were written
 * by earlier versions of the web app. Use them in JSDoc: `@param {import('@/core/types').SalesInvoice} invoice`.
 */

/**
 * @typedef {Object} PaymentBreakdown
 * @property {number} cash
 * @property {number} upi
 * @property {number} account
 */

/**
 * @typedef {Object} ProductLine
 * @property {number} [sno]
 * @property {string} description
 * @property {number} qty
 * @property {number} rate
 * @property {number} amount
 */

/**
 * @typedef {Object} SalesInvoice
 * @property {string} invoiceNo
 * @property {string} invoiceDate YYYY-MM-DD
 * @property {string} customerName
 * @property {string} customerAddress
 * @property {string} customerPhone
 * @property {ProductLine[]} products
 * @property {number} subtotal
 * @property {number} previousBalance
 * @property {number} [manualPreviousBalance]
 * @property {number} [discountAmount]
 * @property {number} [discount] legacy field name seen on some old documents
 * @property {number} grandTotal
 * @property {PaymentBreakdown} [paymentBreakdown]
 * @property {string} [paymentMethod] legacy single-method field on very old invoices
 * @property {number} amountPaid
 * @property {number} balanceDue
 * @property {number} [totalReturns]
 * @property {number} [adjustedBalanceDue]
 * @property {string} [createdAt]
 * @property {FirestoreTimestamp} [updatedAt]
 */

/**
 * @typedef {Object} SalesPayment
 * @property {string} id
 * @property {string} invoiceNo
 * @property {string} paymentDate YYYY-MM-DD
 * @property {number} amount
 * @property {string} paymentMethod
 * @property {string} [paymentType] 'initial' = entered on the bill itself; anything else = added later from history
 * @property {string} [note]
 * @property {FirestoreTimestamp} [createdAt]
 */

/**
 * @typedef {Object} SalesReturn
 * @property {string} id
 * @property {string} invoiceNo
 * @property {string} returnDate
 * @property {string} description
 * @property {number} qty
 * @property {number} rate
 * @property {number} returnAmount
 * @property {string} [reason]
 * @property {FirestoreTimestamp} [createdAt]
 */

/**
 * @typedef {Object} Customer
 * @property {string} phone
 * @property {string} name
 * @property {string} address
 * @property {string} [lastUpdated]
 * @property {FirestoreTimestamp} [updatedAt]
 */

/**
 * Purchase bills carry BOTH a nested `payment` object (new bills) and top-level fields (edited / legacy bills).
 * @typedef {Object} PurchasePaymentSummary
 * @property {number} cash
 * @property {number} upi
 * @property {number} account
 * @property {number} totalPaid
 * @property {number} balanceDue
 */

/**
 * @typedef {Object} PurchaseBill
 * @property {string} invoiceNo
 * @property {string} invoiceDate
 * @property {string} supplierName
 * @property {string} supplierPhone
 * @property {string} supplierAddress
 * @property {ProductLine[]} products
 * @property {number} subtotal
 * @property {number} [previousBalance]
 * @property {number} [manualPreviousBalance]
 * @property {number} [discount]
 * @property {number} [discountAmount]
 * @property {number} grandTotal
 * @property {PurchasePaymentSummary} [payment]
 * @property {PaymentBreakdown} [paymentBreakdown]
 * @property {string} [paymentMethod]
 * @property {number} [amountPaid]
 * @property {number} [balanceDue]
 * @property {number} [totalReturns]
 * @property {number} [adjustedBalanceDue]
 * @property {FirestoreTimestamp} [timestamp]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} PurchasePayment
 * @property {string} id
 * @property {string} invoiceNo
 * @property {string} paymentDate
 * @property {number} amount
 * @property {string} paymentMethod
 * @property {string} [paymentType]
 * @property {string} [note]
 * @property {FirestoreTimestamp} [createdAt]
 */

/**
 * @typedef {Object} PurchaseReturn
 * @property {string} id
 * @property {string} invoiceNo
 * @property {string} returnDate
 * @property {string} description
 * @property {number} qty
 * @property {number} rate
 * @property {number} returnAmount
 * @property {string} [reason]
 * @property {FirestoreTimestamp} [createdAt]
 */

/**
 * @typedef {Object} Supplier
 * @property {string} phone
 * @property {string} name
 * @property {string} address
 * @property {string} [lastUpdated]
 * @property {FirestoreTimestamp} [updatedAt]
 */

/**
 * @typedef {Object} Expense
 * @property {string} id
 * @property {string} date YYYY-MM-DD
 * @property {number} amount
 * @property {string} reason
 * @property {string} [updatedAt]
 */

/**
 * Product shortcut; document id === shortcutKey. Shared by sales and purchase bills.
 * @typedef {Object} Shortcut
 * @property {string} shortcutKey
 * @property {string} fullDescription
 * @property {FirestoreTimestamp} [createdAt]
 */

/**
 * @typedef {Object} OpeningStock
 * @property {string} description document id === description
 * @property {number} qty
 * @property {FirestoreTimestamp} [updatedAt]
 */

/**
 * @typedef {Object} SalesRecycleBinItem
 * @property {string} id
 * @property {'invoice'} type
 * @property {string} originalId
 * @property {SalesInvoice} data
 * @property {SalesPayment[]} payments
 * @property {SalesReturn[]} returns
 * @property {FirestoreTimestamp} [deletedAt]
 * @property {string} customerName
 * @property {string} customerPhone
 * @property {string} invoiceDate
 * @property {number} grandTotal
 */

/**
 * @typedef {Object} PurchaseRecycleBinItem
 * @property {string} id
 * @property {'purchase_invoice'} type
 * @property {string} originalId
 * @property {PurchaseBill} data
 * @property {PurchasePayment[]} payments
 * @property {FirestoreTimestamp} [deletedAt]
 * @property {string} supplierName
 * @property {string} supplierPhone
 * @property {string} invoiceDate
 * @property {number} grandTotal
 */

/** @typedef {{seconds: number, nanoseconds: number, toDate?: () => Date} | null | undefined} FirestoreTimestamp */
/** @typedef {'cash' | 'upi' | 'account'} PaymentMethod */
/** @typedef {SalesRecycleBinItem | PurchaseRecycleBinItem} RecycleBinItem */
/** @typedef {'success' | 'error' | 'info' | 'warning'} ToastType */

export {};
