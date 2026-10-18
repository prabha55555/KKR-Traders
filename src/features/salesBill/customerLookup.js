/** Customer lookup + "Previous Balance Due" helpers for the Sales Bill screen (script.js phone `input` handler). */
import { calculatePreviousBalanceAtTime } from '@/core/billing';
import { formatCurrency } from '@/core/format';
import { findPartyByPhone, partyToPickOnEnter, suggestParties } from '@/components/bill/partyMatch';
/** The web page only looked a customer up once the phone box held at least this many characters. */
export const PHONE_LOOKUP_LENGTH = 10;
export const shouldLookupPhone = (phone) => phone.trim().length >= PHONE_LOOKUP_LENGTH;
/** Exact match on the phone number (it is the customer's document id). */
export const findCustomerByPhone = findPartyByPhone;

/** Customers whose phone or name contains what was typed, excluding an exact phone match (that one is applied on its own). */
export const suggestCustomers = suggestParties;

/** Enter in the phone box (website keyboard use): the exact match wins, otherwise the top suggestion. */
export const customerToPickOnEnter = partyToPickOnEnter;

/**
 * The web page stored the previous balance as the 2-decimal TEXT it displayed (`formatCurrency`) and parsed it back
 * for every calculation and for the saved invoice, so the value was always rounded to paise. Same here.
 */
export function roundMoney(amount) {
  return parseFloat(formatCurrency(amount).replace(/[^0-9.-]+/g, '')) || 0;
}
/**
 * Utils.calculateAndSetPreviousBalance: balance carried in from the customer's previous invoice in their ledger
 * (the one before `invoiceNo` / `invoiceDate`). `null` when the ledger could not be read: callers keep the value they
 * show (a silent 0 would be saved as if the customer owed nothing).
 */
export async function previousBalanceFor(customerName, customerPhone, invoiceNo, invoiceDate = null) {
  if (!customerName && !customerPhone) return 0;
  const info = await calculatePreviousBalanceAtTime(
    customerName,
    customerPhone,
    invoiceNo || null,
    invoiceDate || null,
  );
  if (info.failed) return null;
  return roundMoney(info.balanceCarriedForward);
}
