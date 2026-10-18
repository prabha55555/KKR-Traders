import { useCallback, useMemo, useRef, useState } from 'react';
import { db } from '@/core/db';
import { findCustomerByPhone, previousBalanceFor, shouldLookupPhone } from './customerLookup';
/**
 * script.js `customerPhone` input handler: once the phone holds 10+ characters the customer is looked up; a hit fills
 * name/address and computes the previous balance, a miss clears them. Stale answers (the user kept typing) are dropped.
 */
export function useCustomerLookup({ customersRef, getForm, patch, onError, onCustomerFound }) {
  const latest = useRef(0);
  const notFoundRef = useRef(null);
  /** the 10+ character phone for which no customer exists (drives the "Add customer" hint) */
  const [notFoundPhone, setNotFoundState] = useState(null);
  const setNotFound = useCallback((phone) => {
    notFoundRef.current = phone;
    setNotFoundState(phone);
  }, []);
  const applyCustomer = useCallback(
    async (customer, rawPhone, request) => {
      patch({ customerName: customer.name || '', customerAddress: customer.address || '' });
      onCustomerFound?.(customer);
      const { invoiceNo, invoiceDate } = getForm();
      const previousBalance = await previousBalanceFor(customer.name || '', rawPhone, invoiceNo, invoiceDate);
      if (request === latest.current) patch({ previousBalance });
    },
    [getForm, onCustomerFound, patch],
  );
  const onPhoneChange = useCallback(
    (rawPhone) => {
      patch({ customerPhone: rawPhone });
      const request = ++latest.current;
      setNotFound(null);
      if (!shouldLookupPhone(rawPhone)) return;
      void (async () => {
        try {
          const phone = rawPhone.trim();
          // Local list first (instant, works offline); the exact Firestore lookup is the web app's behaviour.
          const customer = findCustomerByPhone(customersRef.current, phone) ?? (await db.getCustomer(phone));
          if (request !== latest.current) return;
          if (!customer) {
            setNotFound(phone);
            patch({ customerName: '', customerAddress: '', previousBalance: 0 });
            return;
          }
          await applyCustomer(customer, rawPhone, request);
        } catch (error) {
          console.error('Error looking up customer', error);
          if (request === latest.current)
            onError('Could not look up the customer. Please check your connection.');
        }
      })();
    },
    [applyCustomer, customersRef, onError, patch, setNotFound],
  );
  /** A suggestion from the picker was tapped (the datalist `input` event in the web page). */
  const onSelect = useCallback(
    (party) => {
      const request = ++latest.current;
      setNotFound(null);
      patch({
        customerPhone: party.phone,
        customerName: party.name || '',
        customerAddress: party.address || '',
      });
      onCustomerFound?.(party);
      void previousBalanceFor(party.name || '', party.phone, getForm().invoiceNo, getForm().invoiceDate)
        .then((previousBalance) => {
          if (request === latest.current) patch({ previousBalance });
        })
        .catch((error) => console.error('Error calculating previous balance', error));
    },
    [getForm, onCustomerFound, patch, setNotFound],
  );
  /** After the customer list was refreshed (e.g. coming back from "Add Customer"): retry a number that was unknown. */
  const recheck = useCallback(() => {
    if (notFoundRef.current && findCustomerByPhone(customersRef.current, notFoundRef.current)) {
      onPhoneChange(getForm().customerPhone);
    }
  }, [customersRef, getForm, onPhoneChange]);
  /** Forget everything in flight (form reset / another invoice opened). */
  const cancel = useCallback(() => {
    latest.current++;
    setNotFound(null);
  }, [setNotFound]);
  return useMemo(
    () => ({ notFoundPhone, onPhoneChange, onSelect, recheck, cancel }),
    [notFoundPhone, onPhoneChange, onSelect, recheck, cancel],
  );
}
