/**
 * Data access layer — port of the web app's `js/db.js` (class Database).
 *
 * Method names, collection names, document ids and write semantics are intentionally IDENTICAL to the
 * web app because both apps share one Firestore project. Differences from the web version:
 *  - modular Firebase v12 SDK instead of the compat SDK
 *  - offline reads come from Firestore's own IndexedDB cache (persistentLocalCache, see ./firebase) like the web app
 *  - the handful of places where web pages talked to `db.firestore.collection(...)` directly are now methods here
 *  - `updateSubsequentInvoices` (a `Utils` method on web) lives here to avoid a db <-> utils import cycle
 */
import {
  collection,
  deleteDoc as fbDeleteDoc,
  doc,
  getDoc as fbGetDoc,
  getDocs as fbGetDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDb } from './firebase';
import {
  PURCHASE_LEDGER,
  SALES_LEDGER,
  compareLedgerOrder,
  computeLedger,
  normalizePhone,
  partyOpening,
  purchaseLedgerChanges,
  resolveParty,
  returnsTotalsByInvoice,
  salesLedgerChanges,
} from './ledger';
import { invoiceNoLabel, toNum } from './format';
import { foldBreakdown, foldPurchasePayment, normalizeMethod } from './paymentMethods';

const isAmountValue = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
import { recordFirestoreOperation } from './services/firestoreUsageTracker';

// Transparent tracking wrappers — preserves exact signatures and behaviors with zero extra network overhead
const getDoc = async (...args) => {
  const res = await fbGetDoc(...args);
  recordFirestoreOperation('read', 1);
  return res;
};

const getDocs = async (...args) => {
  const res = await fbGetDocs(...args);
  recordFirestoreOperation('read', res?.size ?? res?.docs?.length ?? 1);
  return res;
};

const setDoc = async (...args) => {
  const res = await fbSetDoc(...args);
  recordFirestoreOperation('write', 1);
  return res;
};

const updateDoc = async (...args) => {
  const res = await fbUpdateDoc(...args);
  recordFirestoreOperation('write', 1);
  return res;
};

const deleteDoc = async (...args) => {
  const res = await fbDeleteDoc(...args);
  recordFirestoreOperation('delete', 1);
  return res;
};

const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
/**
 * Lists read from Firestore are kept in memory for a short while only: after this the next read goes to Firestore
 * again, so changes made on another device / tab show up by themselves (there is no Refresh button).
 */
export const CACHE_MAX_AGE_MS = 60_000;

export class Database {
  initialized = false;
  firestore;
  // In-memory cache to improve loading performance (entries expire after CACHE_MAX_AGE_MS — see _cached)
  _cache = {};
  _cacheAt = {};
  /** bumped by invalidate(): a read that started before a save never stores its (older) result */
  _gen = {};
  _epoch = 0;
  // Promise cache to prevent duplicate simultaneous network requests
  _promises = {};
  // ------------------------------------------------------------------ init / helpers
  async init() {
    if (this.initialized) return this.firestore;
    this.firestore = getDb();
    this.initialized = true;
    return this.firestore;
  }
  async ensureInitialized() {
    if (!this.initialized) await this.init();
  }
  _checkInit() {
    if (!this.initialized) {
      // The web app threw here; pages can mount before the root init finishes, so self-heal.
      this.firestore = getDb();
      this.initialized = true;
    }
  }
  // Listeners for cache invalidation events
  _listeners = [];
  onInvalidate(fn) {
    if (typeof fn === 'function') {
      this._listeners.push(fn);
    }
  }
  /** Drop in-memory caches (e.g. refresh button, logout). */
  invalidateAll() {
    this._cache = {};
    this._promises = {};
    this._epoch += 1;
    this._listeners.forEach((fn) => {
      try {
        fn([]);
      } catch (e) {
        console.error('Error in onInvalidate listener:', e);
      }
    });
  }
  /** A cached list while it is fresh; null (and dropped) once older than CACHE_MAX_AGE_MS. */
  _cached(key) {
    const value = this._cache[key];
    if (!value) return null;
    if (Date.now() - (this._cacheAt[key] ?? 0) > CACHE_MAX_AGE_MS) {
      this._cache[key] = null;
      return null;
    }
    return value;
  }
  invalidate(...keys) {
    keys.forEach((k) => {
      this._cache[k] = null;
      this._promises[k] = null;
      this._gen[k] = (this._gen[k] ?? 0) + 1;
    });
    this._listeners.forEach((fn) => {
      try {
        fn(keys);
      } catch (e) {
        console.error('Error in onInvalidate listener:', e);
      }
    });
  }
  col(name) {
    this._checkInit();
    return collection(this.firestore, name);
  }
  ref(name, id) {
    this._checkInit();
    return doc(this.firestore, name, id);
  }
  /**
   * Memory cache -> in-flight request -> Firestore (which serves its IndexedDB cache when the device is offline).
   */
  async _load(key, fetcher, opts = {}) {
    const { memory = true, onError = 'throw' } = opts;
    this._checkInit();
    const cached = memory ? this._cached(key) : null;
    if (cached) {
      recordFirestoreOperation('cacheHit', 1);
      return cached;
    }
    // the shared in-flight request always rejects on failure; each caller applies its own fallback, so a strict caller
    // that joins a lenient request still sees the error
    const withFallback = (promise) =>
      onError === 'empty'
        ? promise.catch((error) => {
            console.error(`[db] ${key}: read failed`, error);
            return [];
          })
        : promise;
    if (memory && this._promises[key]) return withFallback(this._promises[key]);
    const gen = `${this._epoch}:${this._gen[key] ?? 0}`;
    const run = Promise.resolve()
      .then(fetcher)
      .then((result) => {
        // invalidated while reading (a save happened): hand the result to this caller but do not cache it
        if (memory && `${this._epoch}:${this._gen[key] ?? 0}` === gen) {
          this._cache[key] = result;
          this._cacheAt[key] = Date.now();
        }
        return result;
      })
      .finally(() => {
        if (this._promises[key] === run) this._promises[key] = null;
      });
    if (memory) this._promises[key] = run;
    return withFallback(run);
  }
  async _all(name) {
    const snap = await getDocs(this.col(name));
    return snap?.docs ? snap.docs.map((d) => d.data()) : [];
  }
  async _where(name, field, value) {
    const snap = await getDocs(query(this.col(name), where(field, '==', value)));
    return snap?.docs ? snap.docs.map((d) => d.data()) : [];
  }
  async _deleteWhere(name, field, value) {
    const snap = await getDocs(query(this.col(name), where(field, '==', value)));
    if (!snap?.docs) return 0;
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    return snap.size || 0;
  }
  // ------------------------------------------------------------------ Sales invoices
  async saveInvoice(invoiceData) {
    await setDoc(this.ref('invoices', invoiceData.invoiceNo), {
      ...invoiceData,
      updatedAt: serverTimestamp(),
    });
    this.invalidate('invoices');
    return invoiceData.invoiceNo;
  }
  async getAllInvoices() {
    return this._load('invoices', async () => {
      const invoices = await this._all('invoices');
      // Sort by invoice date descending (newest first)
      return invoices.sort((a, b) => {
        const dateA = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
        const dateB = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
        return dateB - dateA;
      });
    });
  }
  async getInvoice(invoiceNo) {
    const cached = this._cached('invoices')?.find((i) => i.invoiceNo === invoiceNo);
    if (cached) return cached;
    const snap = await getDoc(this.ref('invoices', invoiceNo));
    return snap.exists() ? snap.data() : null;
  }
  /** Delete = move to recycle bin (the web app's later `deleteInvoice` definition overrides the permanent one). */
  async deleteInvoice(invoiceNo, opts) {
    await this.moveInvoiceToRecycleBin(invoiceNo, opts);
  }
  // ------------------------------------------------------------------ Sales payments
  async savePayment(paymentData) {
    const paymentId = paymentData.id || uid('payment');
    await setDoc(this.ref('payments', paymentId), {
      ...paymentData,
      id: paymentId,
      createdAt: serverTimestamp(),
    });
    this.invalidate('payments');
    return paymentId;
  }
  async getPaymentsByInvoice(invoiceNo) {
    try {
      return await this._where('payments', 'invoiceNo', invoiceNo);
    } catch (error) {
      console.error('Error getting payments from Firebase:', error);
      return [];
    }
  }
  async getAllPayments() {
    return this._load('payments', () => this._all('payments'), {
      memory: false,
      onError: 'empty',
    });
  }
  /** Raw delete of one payment document (no invoice recalculation). */
  async deletePaymentDoc(paymentId) {
    await deleteDoc(this.ref('payments', paymentId));
    this.invalidate('payments');
  }
  /** `syncLedger: false` = the caller re-syncs the customer's ledger once after several deletions. */
  async deletePayment(paymentId, { syncLedger = true } = {}) {
    let snap = await getDoc(this.ref('payments', paymentId));
    let usedId = paymentId;
    if (!snap.exists()) {
      // Try alternative ID formats (the web app stored ids in several shapes over time)
      const alternativeIds = [paymentId.toString(), `payment_${paymentId}`, paymentId];
      let found = false;
      for (const altId of alternativeIds) {
        const altSnap = await getDoc(this.ref('payments', altId));
        if (altSnap.exists()) {
          snap = altSnap;
          usedId = altId;
          found = true;
          break;
        }
      }
      if (!found) throw new Error(`Payment not found with any ID format: ${paymentId}`);
    }
    const paymentData = snap.data();
    await deleteDoc(this.ref('payments', usedId));
    this.invalidate('payments');
    if (paymentData.invoiceNo) {
      await this.updateInvoiceAfterPaymentDeletion(paymentData.invoiceNo, paymentData.amount, {
        syncLedger,
        paymentMethod: paymentData.paymentMethod,
      });
    }
  }
  /**
   * Update an invoice after one of its payments was deleted: the amount leaves amountPaid / balanceDue and the
   * deleted payment's own method in the cash / account split (`paymentMethod`; without it the invoice's legacy
   * single method, else cash). The split is written folded, so a legacy `upi` amount becomes Account and its key goes.
   */
  async updateInvoiceAfterPaymentDeletion(
    invoiceNo,
    paymentAmount,
    { syncLedger = true, paymentMethod } = {},
  ) {
    const invoiceData = await this.getInvoice(invoiceNo);
    if (!invoiceData) return;
    const invoice = { ...invoiceData };
    if (invoice.paymentBreakdown) {
      const method = normalizeMethod(paymentMethod ?? invoice.paymentMethod);
      const split = foldBreakdown(invoice.paymentBreakdown);
      split[method] = Math.max(0, split[method] - toNum(paymentAmount));
      invoice.paymentBreakdown = split;
    }
    invoice.amountPaid = Math.max(0, invoice.amountPaid - paymentAmount);
    invoice.balanceDue = invoice.grandTotal - invoice.amountPaid;
    await this.saveInvoice(invoice);
    if (syncLedger) await this.syncSalesLedger(invoice);
  }
  async deletePaymentsByInvoice(invoiceNo) {
    await this._deleteWhere('payments', 'invoiceNo', invoiceNo);
    this.invalidate('payments');
  }
  // ------------------------------------------------------------------ Sales returns
  async saveReturn(returnData) {
    const returnId = returnData.id || uid('return');
    await setDoc(this.ref('returns', returnId), {
      ...returnData,
      id: returnId,
      createdAt: serverTimestamp(),
    });
    this.invalidate('returns');
    return returnId;
  }
  async getReturnsByInvoice(invoiceNo) {
    try {
      return await this._where('returns', 'invoiceNo', invoiceNo);
    } catch (error) {
      console.error('Error getting returns from Firebase:', error);
      return [];
    }
  }
  /** `strict`: a failed read throws instead of looking like "no returns" (balance calculations need to know). */
  async getAllReturns({ strict = false } = {}) {
    return this._load('returns', () => this._all('returns'), { onError: strict ? 'throw' : 'empty' });
  }
  async deleteReturn(returnId) {
    await deleteDoc(this.ref('returns', returnId.toString()));
    this.invalidate('returns');
  }
  async deleteReturnsByInvoice(invoiceNo) {
    await this._deleteWhere('returns', 'invoiceNo', invoiceNo);
    this.invalidate('returns');
  }
  // ------------------------------------------------------------------ Customers
  /** `merge`: keep the fields not given (bill screens only know name/address and must not wipe openingBalance). */
  async saveCustomer(customerData, { merge = false } = {}) {
    const data = { ...customerData, updatedAt: serverTimestamp() };
    if (merge) await setDoc(this.ref('customers', customerData.phone), data, { merge: true });
    else await setDoc(this.ref('customers', customerData.phone), data);
    this.invalidate('customers');
    return customerData.phone;
  }
  async getCustomer(phone) {
    const snap = await getDoc(this.ref('customers', phone));
    return snap?.exists?.() ? snap.data() : null;
  }
  async getAllCustomers() {
    return this._load('customers', () => this._all('customers'));
  }
  /** Raw delete of the customer document only (used when a customer's phone number — the doc id — changes). */
  async deleteCustomerDoc(phone) {
    await deleteDoc(this.ref('customers', phone));
    this.invalidate('customers');
  }
  /** Deletes the customer AND moves all of their invoices to the recycle bin (no ledger to keep: it all goes). */
  async deleteCustomer(phone) {
    const invoices = await this._where('invoices', 'customerPhone', phone);
    await Promise.all(invoices.map((inv) => this.deleteInvoice(inv.invoiceNo, { syncLedger: false })));
    await deleteDoc(this.ref('customers', phone));
    this.invalidate('customers');
  }
  /** Rewrites name/phone/address on all of a customer's invoices (matched by old name) and the customer doc. */
  /** `oldPhone`: the customer's phone before the edit (its chain is re-synced too when it changes). */
  async updateCustomerDetails(
    oldName,
    newName,
    newPhone,
    newAddress,
    openingBalance,
    { oldPhone, newOpening } = {},
  ) {
    const snap = await getDocs(query(this.col('invoices'), where('customerName', '==', oldName)));
    const docs = await this._ownBillsOfName(
      snap.docs,
      oldPhone,
      (b) => b.customerPhone,
      oldName,
      () => this.getAllCustomers().then((list) => list.map((c) => ({ name: c.name, phone: c.phone }))),
    );
    await Promise.all(
      docs.map((d) =>
        updateDoc(d.ref, {
          customerName: newName,
          customerPhone: newPhone,
          customerAddress: newAddress,
          updatedAt: serverTimestamp(),
        }),
      ),
    );
    this.invalidate('invoices');
    if (newPhone) {
      const customerData = { name: newName, phone: newPhone, address: newAddress };
      if (openingBalance !== undefined) customerData.openingBalance = openingBalance;
      await this.saveCustomer(customerData, { merge: true });
    }
    // the rewritten invoices may now form one chain (or have left another): keep the stored balances in step;
    // `newOpening` = the opening balance was changed on the customer form
    await this.syncSalesLedger(
      { customerName: newName, customerPhone: newPhone },
      newOpening !== undefined ? { opening: newOpening } : undefined,
    );
    if (oldPhone !== undefined && normalizePhone(oldPhone) !== normalizePhone(newPhone)) {
      await this.syncSalesLedger({ customerName: oldName, customerPhone: oldPhone });
    }
  }
  /**
   * Of the bills carrying a party's (old) name, the ones that are really this party's: those with its phone, and the
   * phone-less ones stamped into its chain — or, unstamped, only while no other phone uses that name. Without an old
   * phone every bill of the name is the party's (as before). `loadParties()` lists the directory ({ name, phone }).
   */
  async _ownBillsOfName(docs, oldPhone, phoneOf, oldName, loadParties) {
    const own = normalizePhone(oldPhone);
    if (!own) return docs;
    const sameName = (n) =>
      String(n ?? '')
        .trim()
        .toLowerCase() ===
      String(oldName ?? '')
        .trim()
        .toLowerCase();
    let namesake = docs.some((d) => {
      const p = normalizePhone(phoneOf(d.data()));
      return p && p !== own;
    });
    if (!namesake) {
      const parties = await loadParties().catch(() => []);
      namesake = parties.some(
        (x) => sameName(x.name) && normalizePhone(x.phone) && normalizePhone(x.phone) !== own,
      );
    }
    return docs.filter((d) => {
      const bill = d.data();
      const p = normalizePhone(phoneOf(bill));
      if (p) return p === own;
      if (bill.ledgerParty !== undefined && bill.ledgerParty !== null)
        return normalizePhone(bill.ledgerParty) === own;
      return !namesake;
    });
  }
  // ------------------------------------------------------------------ Suppliers
  /** `merge`: keep the fields not given (bill screens only know name/address and must not wipe openingBalance). */
  async saveSupplier(supplierData, { merge = false } = {}) {
    const data = { ...supplierData, updatedAt: serverTimestamp() };
    if (merge) await setDoc(this.ref('suppliers', supplierData.phone), data, { merge: true });
    else await setDoc(this.ref('suppliers', supplierData.phone), data);
    this.invalidate('suppliers');
    return supplierData.phone;
  }
  async getSupplier(phone) {
    const snap = await getDoc(this.ref('suppliers', phone));
    return snap.exists() ? snap.data() : null;
  }
  async getAllSuppliers() {
    return this._load('suppliers', () => this._all('suppliers'));
  }
  async deleteSupplier(phone) {
    await deleteDoc(this.ref('suppliers', phone));
    this.invalidate('suppliers');
  }
  // ------------------------------------------------------------------ Purchase bills
  async savePurchaseBill(invoiceData) {
    await setDoc(this.ref('purchase_invoices', invoiceData.invoiceNo), {
      ...invoiceData,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
    });
    this.invalidate('purchaseInvoices');
    return true;
  }
  /** Partial update of a purchase bill (web: `.update(invoiceData)`), used when applying payments/returns. */
  async updatePurchaseBillFields(invoiceNo, data) {
    await updateDoc(this.ref('purchase_invoices', invoiceNo), data);
    this.invalidate('purchaseInvoices');
  }
  /** `strict`: a failed read throws instead of looking like "no bills" (balance calculations need to know). */
  async getAllPurchaseBills({ strict = false } = {}) {
    return this._load(
      'purchaseInvoices',
      async () => {
        const snap = await getDocs(query(this.col('purchase_invoices'), orderBy('timestamp', 'desc')));
        return snap?.docs ? snap.docs.map((d) => d.data()) : Array.isArray(snap) ? snap : [];
      },
      { onError: strict ? 'throw' : 'empty' },
    );
  }
  async getPurchaseBill(invoiceNo) {
    const cached = this._cached('purchaseInvoices')?.find((i) => i.invoiceNo === invoiceNo);
    if (cached) return cached;
    const snap = await getDoc(this.ref('purchase_invoices', invoiceNo));
    return snap.exists() ? snap.data() : null;
  }
  async deletePurchaseBill(invoiceNo) {
    await this.movePurchaseInvoiceToRecycleBin(invoiceNo);
  }
  // ------------------------------------------------------------------ Purchase payments
  async savePurchasePayment(paymentData) {
    const paymentId = paymentData.id || uid('purchase_payment');
    await setDoc(this.ref('purchase_payments', paymentId), {
      ...paymentData,
      id: paymentId,
      createdAt: serverTimestamp(),
    });
    this.invalidate('purchasePayments');
    return paymentId;
  }
  async getAllPurchasePayments() {
    return this._load('purchasePayments', () => this._all('purchase_payments'), {
      memory: false,
      onError: 'empty',
    });
  }
  async getPurchasePaymentsByInvoice(invoiceNo) {
    try {
      return await this._where('purchase_payments', 'invoiceNo', invoiceNo);
    } catch (error) {
      console.error('Error getting purchase payments by invoice:', error);
      return [];
    }
  }
  /** Raw delete of one purchase-payment document (no bill recalculation). */
  async deletePurchasePaymentDoc(paymentId) {
    await deleteDoc(this.ref('purchase_payments', paymentId));
    this.invalidate('purchasePayments');
  }
  /** `syncLedger: false` = the caller re-syncs the supplier's ledger once after several deletions. */
  async deletePurchasePayment(paymentId, { syncLedger = true } = {}) {
    const snap = await getDoc(this.ref('purchase_payments', paymentId));
    if (!snap.exists()) return;
    const paymentData = snap.data();
    await deleteDoc(this.ref('purchase_payments', paymentId));
    this.invalidate('purchasePayments');
    if (paymentData.invoiceNo && paymentData.amount) {
      await this.updatePurchaseInvoiceAfterPaymentDeletion(paymentData.invoiceNo, paymentData.amount, {
        syncLedger,
        paymentMethod: paymentData.paymentMethod,
        paymentType: paymentData.paymentType,
      });
    }
    return true;
  }
  /**
   * Update a purchase bill after one of its payments was deleted: like the sales version, the amount leaves the paid
   * totals; a payment added later also leaves its method in the top-level cash / account breakdown. A payment made
   * WITH the bill (`paymentType` 'initial') is not in that breakdown (a purchase bill keeps it in the nested `payment`
   * split, which the History undo lowers itself — taking it from the breakdown wiped later payments). Both splits are
   * written folded, so a legacy `upi` amount becomes Account and its key goes.
   */
  async updatePurchaseInvoiceAfterPaymentDeletion(
    invoiceNo,
    paymentAmount,
    { syncLedger = true, paymentMethod, paymentType } = {},
  ) {
    try {
      const found = await this.getPurchaseBill(invoiceNo);
      if (!found) return;
      const bill = { ...found, ...(found.payment ? { payment: foldPurchasePayment(found.payment) } : {}) };
      if (bill.paymentBreakdown) {
        const method = normalizeMethod(paymentMethod ?? bill.paymentMethod);
        const split = foldBreakdown(bill.paymentBreakdown);
        // an initial payment of a bill WITH a nested split is not in the top-level breakdown
        if (!(paymentType === 'initial' && bill.payment))
          split[method] = Math.max(0, split[method] - toNum(paymentAmount));
        bill.paymentBreakdown = split;
      }
      bill.amountPaid = Math.max(0, (bill.amountPaid || bill.payment?.totalPaid || 0) - paymentAmount);
      bill.balanceDue = bill.grandTotal - bill.amountPaid;
      // Keep the nested payment object in sync if it exists
      if (bill.payment) {
        bill.payment.totalPaid = bill.amountPaid;
        bill.payment.balanceDue = bill.balanceDue;
      }
      await this.savePurchaseBill(bill);
      // NOTE: the web app called the SALES Utils.updateSubsequentInvoices(supplierName, ...) here (wrong ledger); the
      // supplier's own ledger is re-synced instead so the later bills' previous balance follows.
      if (syncLedger) await this.syncPurchaseLedger(bill);
    } catch (error) {
      console.error('Error updating purchase invoice after payment deletion:', error);
    }
  }
  async deletePurchasePaymentsByInvoice(invoiceNo) {
    await this._deleteWhere('purchase_payments', 'invoiceNo', invoiceNo);
    this.invalidate('purchasePayments');
  }
  // ------------------------------------------------------------------ Purchase returns
  async savePurchaseReturn(returnData) {
    const returnId = returnData.id || uid('purchasereturn');
    await setDoc(this.ref('purchaseReturns', returnId), {
      ...returnData,
      id: returnId,
      createdAt: serverTimestamp(),
    });
    this.invalidate('purchaseReturns');
    return returnId;
  }
  async getPurchaseReturnsByInvoice(invoiceNo) {
    return this._where('purchaseReturns', 'invoiceNo', invoiceNo);
  }
  async getAllPurchaseReturns() {
    return this._load('purchaseReturns', () => this._all('purchaseReturns'));
  }
  async deletePurchaseReturn(returnId) {
    await deleteDoc(this.ref('purchaseReturns', returnId.toString()));
    this.invalidate('purchaseReturns');
  }
  async deletePurchaseReturnsByInvoice(invoiceNo) {
    await this._deleteWhere('purchaseReturns', 'invoiceNo', invoiceNo);
    this.invalidate('purchaseReturns');
  }
  // ------------------------------------------------------------------ Shortcuts (shared by sales + purchase bills)
  async getAllShortcuts() {
    return this._load(
      'shortcuts',
      async () => {
        const shortcuts = await this._all('shortcuts');
        return shortcuts.sort((a, b) => a.shortcutKey.localeCompare(b.shortcutKey));
      },
      { onError: 'empty' },
    );
  }
  async getShortcut(shortcutKey) {
    const snap = await getDoc(this.ref('shortcuts', shortcutKey));
    return snap.exists() ? snap.data() : null;
  }
  /** Uses the shortcut key as the document id for easy lookup/overwrite. */
  async saveShortcut(shortcut) {
    await setDoc(this.ref('shortcuts', shortcut.shortcutKey), { ...shortcut, createdAt: serverTimestamp() });
    this.invalidate('shortcuts');
    return shortcut.shortcutKey;
  }
  async deleteShortcut(shortcutKey) {
    await deleteDoc(this.ref('shortcuts', shortcutKey));
    this.invalidate('shortcuts');
  }
  // Legacy purchase_shortcuts collection (present in db.js, unused by any page)
  async savePurchaseShortcut(shortcutData) {
    await setDoc(this.ref('purchase_shortcuts', shortcutData.id), {
      ...shortcutData,
      updatedAt: serverTimestamp(),
    });
    this.invalidate('purchaseShortcuts');
    return shortcutData.id;
  }
  async getAllPurchaseShortcuts() {
    return this._load('purchaseShortcuts', () => this._all('purchase_shortcuts'), { onError: 'empty' });
  }
  async deletePurchaseShortcut(id) {
    await deleteDoc(this.ref('purchase_shortcuts', id));
    this.invalidate('purchaseShortcuts');
  }
  // ------------------------------------------------------------------ Opening stock
  /**
   * Document id of a product-keyed record (opening stock, product metadata): the description itself, except that "/"
   * (which Firestore reads as a path separator) is written as %2F. Names without "/" keep the id they always had.
   */
  _productDocId(description) {
    return String(description ?? '').replace(/\//g, '%2F');
  }
  /** `rolls` = optional roll count of the opening stock; a call without it stores what it always did (no `rolls`). */
  async saveOpeningStock(description, qty, rolls) {
    const data = { description, qty, updatedAt: serverTimestamp() };
    if (rolls !== undefined && rolls !== null) data.rolls = toNum(rolls);
    await setDoc(this.ref('openingStocks', this._productDocId(description)), data);
    this.invalidate('openingStocks');
    return description;
  }
  async deleteOpeningStock(description) {
    await deleteDoc(this.ref('openingStocks', this._productDocId(description)));
    this.invalidate('openingStocks');
    return description;
  }
  async getAllOpeningStocks() {
    return this._load('openingStocks', () => this._all('openingStocks'), {
      onError: 'empty',
    });
  }
  // ------------------------------------------------------------------ Product Metadata
  async saveProductMetadata(description, metadata) {
    await setDoc(
      this.ref('productMetadata', this._productDocId(description)),
      { ...metadata, description, updatedAt: serverTimestamp() },
      { merge: true },
    );
    this.invalidate('productMetadata');
    return description;
  }
  async getAllProductMetadata() {
    return this._load('productMetadata', () => this._all('productMetadata'), {
      onError: 'empty',
    });
  }
  // ------------------------------------------------------------------ Expenses
  async saveExpense(expenseData) {
    await setDoc(this.ref('expenses', expenseData.id), expenseData);
    this.invalidate('expenses');
    return expenseData;
  }
  async getAllExpenses() {
    return this._load('expenses', async () => {
      const expenses = await this._all('expenses');
      // Sort by date descending
      return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
  }
  async deleteExpense(id) {
    await deleteDoc(this.ref('expenses', id));
    this.invalidate('expenses');
  }
  // ------------------------------------------------------------------ Sales recycle bin
  async moveInvoiceToRecycleBin(invoiceNo, { syncLedger = true } = {}) {
    const invoiceData = await this.getInvoice(invoiceNo);
    if (!invoiceData) return;
    const payments = await this.getPaymentsByInvoice(invoiceNo);
    const returns = await this.getReturnsByInvoice(invoiceNo);
    const entry = {
      id: `invoice_${invoiceNo}_${Date.now()}`,
      type: 'invoice',
      originalId: invoiceNo,
      data: invoiceData,
      payments,
      returns,
      deletedAt: serverTimestamp(),
      customerName: invoiceData.customerName,
      customerPhone: invoiceData.customerPhone,
      invoiceDate: invoiceData.invoiceDate,
      grandTotal: invoiceData.grandTotal,
    };
    await setDoc(this.ref('recycleBin', entry.id), entry);
    await deleteDoc(this.ref('invoices', invoiceNo));
    this.invalidate('recycleBin');
    this.invalidate('invoices');
    await this.deletePaymentsByInvoice(invoiceNo);
    await this.deleteReturnsByInvoice(invoiceNo);
    // the bills after it no longer carry its balance (the web's call here was a no-op: the invoice was already gone)
    if (syncLedger) await this.syncSalesLedger(invoiceData, { before: invoiceData });
    await this.cleanupOrphanedData();
  }
  async getRecycleBinItems() {
    return this._load(
      'recycleBin',
      async () => {
        const snap = await getDocs(query(this.col('recycleBin'), orderBy('deletedAt', 'desc')));
        return snap.docs.map((d) => d.data());
      },
      { onError: 'empty' },
    );
  }
  async restoreFromRecycleBin(itemId) {
    const docRef = this.ref('recycleBin', itemId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Recycle bin item not found');
    const item = snap.data();
    if (item.type === 'invoice') {
      await this._refuseRestoreOver('invoices', item.originalId, 'Sales');
      await setDoc(this.ref('invoices', item.originalId), item.data);
      for (const payment of item.payments || []) await this.savePayment(payment);
      for (const returnItem of item.returns || []) await this.saveReturn(returnItem);
      await this.syncSalesLedger(item.data, { changedNo: item.originalId, restored: true });
    }
    await deleteDoc(docRef);
    this.invalidate('recycleBin', 'invoices', 'payments', 'returns');
    return item.originalId;
  }
  /**
   * A newer bill may have taken the deleted bill's number since: restoring would silently replace it (and hand it the
   * restored bill's payments). Refuse instead.
   */
  async _refuseRestoreOver(name, id, label) {
    const existing = await getDoc(this.ref(name, String(id)));
    if (existing?.exists?.()) {
      throw new Error(
        `${label} ${invoiceNoLabel(id)} already exists (the number was used again after this one was deleted). Delete or renumber the current ${invoiceNoLabel(id)} before restoring this one.`,
      );
    }
  }
  async permanentDeleteFromRecycleBin(itemId) {
    await deleteDoc(this.ref('recycleBin', itemId));
    this.invalidate('recycleBin');
  }
  async emptyRecycleBin() {
    const snap = await getDocs(this.col('recycleBin'));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    this.invalidate('recycleBin');
    return snap.size;
  }
  // ------------------------------------------------------------------ Purchase recycle bin
  async movePurchaseInvoiceToRecycleBin(invoiceNo) {
    const all = await this.getAllPurchaseBills();
    const invoiceData = all.find((inv) => String(inv.invoiceNo) === String(invoiceNo));
    if (!invoiceData) return;
    const payments = await this.getPurchasePaymentsByInvoice(invoiceNo);
    const returns = await this.getPurchaseReturnsByInvoice(invoiceNo);
    const entry = {
      id: `pinvoice_${invoiceNo}_${Date.now()}`,
      type: 'purchase_invoice',
      originalId: invoiceNo,
      data: invoiceData,
      payments,
      returns,
      deletedAt: serverTimestamp(),
      supplierName: invoiceData.supplierName,
      supplierPhone: invoiceData.supplierPhone || '',
      invoiceDate: invoiceData.invoiceDate,
      grandTotal: invoiceData.grandTotal,
    };
    await setDoc(this.ref('purchaseRecycleBin', entry.id), entry);
    await deleteDoc(this.ref('purchase_invoices', invoiceNo));
    await this.deletePurchasePaymentsByInvoice(invoiceNo);
    await this.deletePurchaseReturnsByInvoice(invoiceNo);
    this.invalidate('purchaseRecycleBin');
    this.invalidate('purchaseInvoices');
    await this.syncPurchaseLedger(invoiceData, { before: invoiceData });
    await this.cleanupOrphanedData();
  }
  async getPurchaseRecycleBinItems() {
    return this._load(
      'purchaseRecycleBin',
      async () => {
        const snap = await getDocs(query(this.col('purchaseRecycleBin'), orderBy('deletedAt', 'desc')));
        return snap.docs.map((d) => d.data());
      },
      { onError: 'empty' },
    );
  }
  async restorePurchaseFromRecycleBin(itemId) {
    const docRef = this.ref('purchaseRecycleBin', itemId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Recycle bin item not found');
    const item = snap.data();
    if (item.type === 'purchase_invoice') {
      await this._refuseRestoreOver('purchase_invoices', item.originalId, 'Purchase');
      await setDoc(this.ref('purchase_invoices', item.originalId), item.data);
      for (const payment of item.payments || []) await this.savePurchasePayment(payment);
      for (const returnItem of item.returns || []) await this.savePurchaseReturn(returnItem);
      await this.syncPurchaseLedger(item.data, { changedNo: item.originalId, restored: true });
    }
    await deleteDoc(docRef);
    this.invalidate('purchaseRecycleBin', 'purchaseInvoices', 'purchasePayments', 'purchaseReturns');
    return item.originalId;
  }
  async permanentDeletePurchaseFromRecycleBin(itemId) {
    await deleteDoc(this.ref('purchaseRecycleBin', itemId));
    this.invalidate('purchaseRecycleBin');
  }
  async emptyPurchaseRecycleBin() {
    const snap = await getDocs(this.col('purchaseRecycleBin'));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    this.invalidate('purchaseRecycleBin');
    return snap.size;
  }
  /** Disabled in the web app by user request: customers/suppliers are NOT deleted when their bills are deleted. */
  async cleanupOrphanedData() {
    return;
  }
  // ------------------------------------------------------------------ Party ledgers (previous balance chain)
  /** Every document of a collection with its real document id (`__docId`), straight from Firestore. */
  async _allWithIds(name) {
    const snap = await getDocs(this.col(name));
    return snap?.docs ? snap.docs.map((d) => ({ ...d.data(), __docId: d.id })) : [];
  }
  /**
   * Writes `{ id, fields }` partial updates in atomic batches. `updateDoc` semantics: a bill deleted in the meantime
   * makes the batch fail instead of being re-created.
   */
  async _applyUpdates(name, updates) {
    if (!updates.length) return;
    this._checkInit();
    for (let i = 0; i < updates.length; i += 400) {
      const chunk = updates.slice(i, i + 400);
      const batch = writeBatch(this.firestore);
      chunk.forEach((u) =>
        batch.update(this.ref(name, String(u.id)), { ...u.fields, updatedAt: serverTimestamp() }),
      );
      await batch.commit();
      recordFirestoreOperation('write', chunk.length);
    }
  }
  /**
   * Rebuilds one party's running-balance chain from FRESH data (never the in-memory cache: another device may have
   * written since) and stores the corrected derived fields of every bill that is off, so a change to any bill flows
   * into all later bills automatically (see core/ledger.js). Never throws: the bill itself is already saved and the
   * next sync of this party repairs the chain.
   *
   * `party`: any object with the party's name / phone (usually the changed bill; a phone-less bill's own
   * `ledgerParty` stamp tells which chain it belongs to).
   * `changedNo` + `before`: the bill this change touched and how it was stored BEFORE the change (`before` null when
   * it is new or restored; a deleted bill is passed as `before`). The party's opening balance is taken from its bills
   * as they were before the change, so moving the first bill's date, deleting it or restoring it never turns a carried
   * balance into the opening. `restored`: the changed bill comes back from the recycle bin (when it is the first bill
   * again, its own opening is the party's). `opening`: an explicit new opening balance (customer / supplier edited).
   * A party's very first bill takes its opening from the customer / supplier record, not from the screen.
   */
  async _syncLedger(
    spec,
    party,
    { before = null, changedNo = null, restored = false, opening: forced } = {},
  ) {
    try {
      const [all, returns] = await Promise.all([
        this._allWithIds(spec.bills),
        this._allWithIds(spec.returns),
      ]);
      const { kind } = spec;
      const { phone: partyPhone, members } = resolveParty(
        kind,
        all,
        kind.name(party),
        kind.phone(party),
        party.ledgerParty,
      );
      const key = changedNo ?? before?.invoiceNo;
      let opening;
      if (forced !== undefined && forced !== null && forced !== '') {
        opening = toNum(forced);
      } else if (key !== null && key !== undefined) {
        const others = members.filter((b) => String(b.invoiceNo) !== String(key));
        const changed = members.find((b) => String(b.invoiceNo) === String(key));
        const previous = [...others];
        if (before) {
          // was the bill (as it was) a member of this party? the same rule as the members themselves
          const was = resolveParty(
            kind,
            [...others, before],
            kind.name(party),
            partyPhone,
            partyPhone,
          ).members;
          if (was.includes(before)) previous.push(before);
        }
        if (previous.length) {
          const first = changed && others.every((b) => compareLedgerOrder(changed, b) < 0);
          opening =
            restored && first
              ? toNum(isAmountValue(changed.ledgerOpening) ? changed.ledgerOpening : changed.previousBalance)
              : partyOpening(previous);
        } else if (!before && changed) {
          // the party's first bill ever: its opening is the customer's / supplier's record, not a screen value
          opening = await spec.recordOpening(party).catch(() => undefined);
        }
      }
      const rows = computeLedger(members, kind, {
        returnsByInvoice: returnsTotalsByInvoice(returns),
        opening: opening ?? undefined,
      });
      const updates = rows
        .map((r) => {
          const fields = spec.changes(r) ?? {};
          // a phone-less bill remembers which chain it was put in, so a later namesake cannot pull it out
          if (!normalizePhone(kind.phone(r.bill)) && r.bill.ledgerParty !== partyPhone)
            fields.ledgerParty = partyPhone;
          return {
            id: r.bill.__docId ?? r.bill.invoiceNo,
            fields: Object.keys(fields).length ? fields : null,
          };
        })
        .filter((u) => u.fields && u.id !== undefined && u.id !== null && u.id !== '');
      await this._applyUpdates(spec.bills, updates);
      this._cache[spec.cacheKey] = null;
      return rows;
    } catch (error) {
      console.error(`Error syncing the ${spec.label} ledger:`, error);
      return null;
    }
  }
  /** Customer ledger (invoices + returns). See _syncLedger. */
  syncSalesLedger(party, opts) {
    return this._syncLedger(
      {
        kind: SALES_LEDGER,
        bills: 'invoices',
        returns: 'returns',
        changes: salesLedgerChanges,
        cacheKey: 'invoices',
        label: 'customer',
        recordOpening: (party) => this._recordOpening('customers', party.customerPhone),
      },
      party,
      opts,
    );
  }
  /** Supplier ledger (purchase_invoices + purchaseReturns). See _syncLedger. */
  syncPurchaseLedger(party, opts) {
    return this._syncLedger(
      {
        kind: PURCHASE_LEDGER,
        bills: 'purchase_invoices',
        returns: 'purchaseReturns',
        changes: purchaseLedgerChanges,
        cacheKey: 'purchaseInvoices',
        label: 'supplier',
        recordOpening: (party) => this._recordOpening('suppliers', party.supplierPhone),
      },
      party,
      opts,
    );
  }
  /** `openingBalance` of a customer / supplier record (undefined when there is no record or no value). */
  async _recordOpening(name, phone) {
    const id = String(phone ?? '').trim();
    if (!id) return undefined;
    const snap = await getDoc(this.ref(name, id));
    const value = snap?.exists?.() ? snap.data().openingBalance : undefined;
    return value === undefined || value === null || value === '' ? undefined : toNum(value);
  }
  /**
   * Kept for the callers of the web app's `Utils.updateSubsequentInvoices(customerName, invoiceNo)`: re-syncs the
   * ledger of the customer of `updatedInvoiceNo` (read fresh, so its phone is known). Nothing is synced when the
   * invoice cannot be read: a name-only guess could pull in another customer with the same name.
   *
   * The web version only rewrote the invoices after the changed one, double counted carried balances when more than
   * one invoice preceded it, dropped discount / opening balance from the recomputed totals, subtracted returns twice
   * and ordered by bare invoice number (wrong across financial years). The full ledger rebuild replaces all of that.
   */
  async updateSubsequentInvoices(customerName, updatedInvoiceNo) {
    try {
      const snap = updatedInvoiceNo ? await getDoc(this.ref('invoices', String(updatedInvoiceNo))) : null;
      if (!snap?.exists?.()) return null;
      return this.syncSalesLedger(snap.data());
    } catch (error) {
      console.error('Error reading the changed invoice:', error);
      return null;
    }
  }
  // ------------------------------------------------------------------ Finance
  async saveFinanceRecord(record) {
    const id = record.id || uid('finance');
    await setDoc(this.ref('finance', id), {
      ...record,
      id,
      updatedAt: serverTimestamp(),
      createdAt: record.createdAt || new Date().toISOString(),
    });
    this.invalidate('finance');
    return id;
  }
  async getAllFinanceRecords() {
    return this._load('finance', async () => {
      const records = await this._all('finance');
      return records.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
    });
  }
  async getFinanceRecord(id) {
    const snap = await getDoc(this.ref('finance', id));
    return snap.exists() ? snap.data() : null;
  }
  async deleteFinanceRecord(id) {
    await deleteDoc(this.ref('finance', id));
    this.invalidate('finance');
  }
  // ------------------------------------------------------------------ Lenders
  async saveLender(lenderData) {
    await setDoc(this.ref('lenders', lenderData.phone), {
      ...lenderData,
      updatedAt: serverTimestamp(),
    });
    this.invalidate('lenders');
    return lenderData.phone;
  }
  async getLender(phone) {
    const snap = await getDoc(this.ref('lenders', phone));
    return snap.exists() ? snap.data() : null;
  }
  async getAllLenders() {
    return this._load('lenders', () => this._all('lenders'));
  }
  async deleteLender(phone) {
    await deleteDoc(this.ref('lenders', phone));
    this.invalidate('lenders');
  }
  // ------------------------------------------------------------------ Bank & Cash Accounts
  async saveBankAccount(account) {
    const id = account.id || uid('acc');
    await setDoc(this.ref('bank_accounts', id), {
      ...account,
      id,
      updatedAt: serverTimestamp(),
      createdAt: account.createdAt || new Date().toISOString(),
    });
    this.invalidate('bank_accounts');
    return id;
  }
  async getAllBankAccounts() {
    return this._load('bank_accounts', async () => {
      const records = await this._all('bank_accounts');
      return records.sort(
        (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      );
    });
  }
  async getBankAccount(id) {
    const snap = await getDoc(this.ref('bank_accounts', id));
    return snap.exists() ? snap.data() : null;
  }
  async deleteBankAccount(id) {
    await deleteDoc(this.ref('bank_accounts', id));
    this.invalidate('bank_accounts');
  }

  // ------------------------------------------------------------------ Cash in Hand / Drawer Config
  async getCashSettings() {
    const snap = await getDoc(this.ref('settings', 'cash_in_hand'));
    return snap.exists() ? snap.data() : { openingBalance: 0, updatedAt: null };
  }
  async saveCashSettings(data) {
    await setDoc(this.ref('settings', 'cash_in_hand'), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  // ------------------------------------------------------------------ Fund Transfers / Account Transactions
  async saveAccountTransaction(tx) {
    const id = tx.id || uid('atx');
    await setDoc(this.ref('account_transactions', id), {
      ...tx,
      id,
      updatedAt: serverTimestamp(),
      createdAt: tx.createdAt || new Date().toISOString(),
    });
    this.invalidate('account_transactions');
    return id;
  }
  async getAllAccountTransactions() {
    return this._load('account_transactions', async () => {
      const records = await this._all('account_transactions');
      return records.sort(
        (a, b) =>
          new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime(),
      );
    });
  }
  async deleteAccountTransaction(id) {
    await deleteDoc(this.ref('account_transactions', id));
    this.invalidate('account_transactions');
  }

  // ------------------------------------------------------------------ Dyeing & Processing Batches (Workflow 2)
  async saveDyeingBatch(batchData) {
    const id = batchData.batchId || batchData.id || uid('batch');
    await setDoc(this.ref('dyeing_batches', id), {
      ...batchData,
      id,
      batchId: id,
      updatedAt: serverTimestamp(),
      createdAt: batchData.createdAt || new Date().toISOString(),
    });
    this.invalidate('dyeing_batches');
    return id;
  }
  async getAllDyeingBatches() {
    return this._load(
      'dyeing_batches',
      async () => {
        const records = await this._all('dyeing_batches');
        return records.sort(
          (a, b) =>
            new Date(b.batchDate || b.createdAt || 0).getTime() -
            new Date(a.batchDate || a.createdAt || 0).getTime(),
        );
      },
      { onError: 'empty' },
    );
  }
  async getDyeingBatch(id) {
    const cached = this._cached('dyeing_batches')?.find((b) => b.id === id || b.batchId === id);
    if (cached) return cached;
    const snap = await getDoc(this.ref('dyeing_batches', id));
    if (snap.exists()) return snap.data();
    const byBatch = await this._where('dyeing_batches', 'batchId', id);
    return byBatch[0] || null;
  }
  async deleteDyeingBatch(id) {
    await deleteDoc(this.ref('dyeing_batches', id));
    await this._deleteWhere('dyeing_batches', 'batchId', id);
    this.invalidate('dyeing_batches');
  }

  // ------------------------------------------------------------------ Dyers / Dyeing Units Directory
  async saveDyer(dyerData) {
    const id = dyerData.id || (dyerData.phone ? `dyer_${dyerData.phone.trim()}` : uid('dyer'));
    await setDoc(this.ref('dyers', id), {
      ...dyerData,
      id,
      updatedAt: serverTimestamp(),
      createdAt: dyerData.createdAt || new Date().toISOString(),
    });
    this.invalidate('dyers');
    return id;
  }
  async getAllDyers() {
    return this._load(
      'dyers',
      async () => {
        const records = await this._all('dyers');
        return records.sort((a, b) => (a.dyeingName || '').localeCompare(b.dyeingName || ''));
      },
      { onError: 'empty' },
    );
  }
  async getDyer(id) {
    const cached = this._cached('dyers')?.find((d) => d.id === id || d.phone === id);
    if (cached) return cached;
    const snap = await getDoc(this.ref('dyers', id));
    return snap.exists() ? snap.data() : null;
  }
  async deleteDyer(id) {
    await deleteDoc(this.ref('dyers', id));
    this.invalidate('dyers');
  }

  // ------------------------------------------------------------------ Combing & Processing Batches
  async saveCombingBatch(batchData) {
    const id = batchData.batchId || batchData.id || uid('combing_batch');
    await setDoc(this.ref('combing_batches', id), {
      ...batchData,
      id,
      batchId: id,
      updatedAt: serverTimestamp(),
      createdAt: batchData.createdAt || new Date().toISOString(),
    });
    this.invalidate('combing_batches');
    return id;
  }
  async getAllCombingBatches() {
    return this._load(
      'combing_batches',
      async () => {
        const records = await this._all('combing_batches');
        return records.sort(
          (a, b) =>
            new Date(b.batchDate || b.createdAt || 0).getTime() -
            new Date(a.batchDate || a.createdAt || 0).getTime(),
        );
      },
      { onError: 'empty' },
    );
  }
  async getCombingBatch(id) {
    const cached = this._cached('combing_batches')?.find((b) => b.id === id || b.batchId === id);
    if (cached) return cached;
    const snap = await getDoc(this.ref('combing_batches', id));
    if (snap.exists()) return snap.data();
    const byBatch = await this._where('combing_batches', 'batchId', id);
    return byBatch[0] || null;
  }
  async deleteCombingBatch(id) {
    await deleteDoc(this.ref('combing_batches', id));
    await this._deleteWhere('combing_batches', 'batchId', id);
    this.invalidate('combing_batches');
  }

  // ------------------------------------------------------------------ Processing lots (Issue -> Dyeing -> Combing -> Received)
  async saveProcessingLot(lot) {
    const id = lot.id || uid('lot');
    await setDoc(this.ref('processing_lots', id), {
      ...lot,
      id,
      updatedAt: serverTimestamp(),
      createdAt: lot.createdAt || new Date().toISOString(),
    });
    this.invalidate('processing_lots');
    return id;
  }
  async getAllProcessingLots() {
    return this._load('processing_lots', () => this._all('processing_lots'));
  }
  async getProcessingLot(id) {
    const snap = await getDoc(this.ref('processing_lots', id));
    return snap.exists() ? snap.data() : null;
  }
  async deleteProcessingLot(id) {
    await deleteDoc(this.ref('processing_lots', id));
    this.invalidate('processing_lots');
  }

  // ------------------------------------------------------------------ Processors Directory (Combing & Processing Units)
  async saveProcessor(processorData) {
    const id = processorData.id || (processorData.phone ? `proc_${processorData.phone.trim()}` : uid('proc'));
    await setDoc(this.ref('processors', id), {
      ...processorData,
      id,
      updatedAt: serverTimestamp(),
      createdAt: processorData.createdAt || new Date().toISOString(),
    });
    this.invalidate('processors');
    return id;
  }
  async getAllProcessors() {
    return this._load(
      'processors',
      async () => {
        const records = await this._all('processors');
        return records.sort((a, b) =>
          (a.processorName || a.name || '').localeCompare(b.processorName || b.name || ''),
        );
      },
      { onError: 'empty' },
    );
  }
  async getProcessor(id) {
    const cached = this._cached('processors')?.find((p) => p.id === id || p.phone === id);
    if (cached) return cached;
    const snap = await getDoc(this.ref('processors', id));
    return snap.exists() ? snap.data() : null;
  }
  async deleteProcessor(id) {
    await deleteDoc(this.ref('processors', id));
    this.invalidate('processors');
  }
}
export const db = new Database();
