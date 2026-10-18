# Business-rule notes — original HTML app → React (JSX) + Tailwind PWA

This app is a React 19 + Tailwind CSS PWA ported from an earlier static HTML + vanilla JS + Firestore application. The
business rules were ported 1:1; this file records the behaviours that were preserved on purpose (some look like bugs)
and what changed.

## 1. Web-app behaviour that was preserved on purpose (looks like a bug — decide before fixing)

These were ported 1:1 so the React app produces the same numbers as the old site on shared data. Each has a `PARITY NOTE`
comment and a unit test pinning the current behaviour.

| # | Where | What the original does | Effect |
|---|-------|------------------------|--------|
| P1 | ~~`Database.updateSubsequentInvoices`~~ | **Fixed — see §2 "Previous balance ledger".** The web's running balance double-counted carried balances. | — |
| P2 | ~~same function~~ | **Fixed — see §2.** Discount and opening balance were dropped from recomputed totals. | — |
| P3 | ~~`calculateSupplierPreviousBalanceAtTime`~~ | **Fixed — see §2.** Read only the top-level `balanceDue`, so new purchase bills carried 0 until the previous bill was edited. | — |
| P4 | `Database.updateInvoiceAfterPaymentDeletion` | Uses the **invoice's** `paymentMethod` — a legacy field that current invoices don't have, so it defaults to `'cash'` — instead of the deleted payment's method to pick the `paymentBreakdown` bucket to reduce. | Deleting a UPI/account payment through `db.deletePayment` reduces the *cash* bucket (totals stay right, the cash/UPI/account split does not). |

| P5 | Invoice numbering (`suggestSalesInvoiceNumber`) + Firestore ids | Invoice numbers restart at `001` every financial year (1 April), but the Firestore **document id is the bare invoice number**. | The first bill of a new financial year uses id `001`, which already exists — the old invoice would be overwritten. The React app asks for confirmation (see §2); the old site overwrote silently. Consider prefixing ids with the financial year. |
| P6 | Sales bill save | Every save is treated as an "edit": old `initial` payments are deleted and re-created and the customer's ledger is re-synced. | Harmless now that the ledger sync is exact (P1/P2 fixed). |
| P7 | Purchase bills | Create and edit write different field sets (edit adds top-level `amountPaid`/`balanceDue`; `payment.totalPaid` includes later payments while `payment.cash/upi/account` hold only the initial split; both overwrite `timestamp`/`createdAt`, so an edited bill jumps to the top of history). | History reads both shapes, so numbers stay consistent; ordering changes after an edit. |
| P8 | Customer / supplier rename | Invoices/bills are matched by **name**, deletion by **phone**; `updateCustomerDetails` re-saves the customer without `lastUpdated`. | Two customers with the same name are rewritten together on rename. |
| P9 | Customer Details totals | "Total Amount" is the sum of `subtotal` (not `grandTotal`): carried-forward and opening balances are not counted, and customers are matched by name only. | A customer's opening balance is missing from their Balance Due on that screen. |

| P10 | Purchase & sales history | Undoing one *additional* payment lowers the `paymentBreakdown` bucket named by the bill's legacy `paymentMethod` (default cash), not the payment's own method; stored `adjustedBalanceDue` is not refreshed on payment changes (screens recompute it). | Cash/UPI/account split can drift; totals stay right. |
| P11 | History lists | Sorting and invoice-number range filters use `parseInt` on the stored number, so a `P-5` purchase bill counts as 0. | Only matters if the database contains `P-` numbers. |
| P12 | Statements | The "easy" statement's Balance Due is Σsubtotal − Σpaid − Σreturns (ignores discounts and carried balances); the normal combined PDF computes totals but never prints them; the opening row of a statement's payment table carries today's date. | Statement balance can differ from the invoice-chain balance. |
| P13 | Stocks | Available stock = opening + purchased − sold; **returns are ignored**; products match by exact (case-sensitive) description; an opening quantity of 0 shows "Add Old Stock". | "Cotton" and "COTTON" are two stock lines. |
| P14 | Shortcuts | Adding an existing key overwrites it silently; editing saves a fresh `createdAt`; a key change is delete-then-save (not atomic). | |

## 2. Fixed / changed relative to the web app

* **Previous balance ledger (sales + purchase)** — `src/core/ledger.js`. Every bill of a customer / supplier is one
  link in a running-balance chain, ordered by bill date, then bill number (numbers restart each financial year), then
  creation time: `previousBalance` = closing balance (balance due − returns) of the bill before it; the first bill
  keeps its stored previous balance (the opening). Previously the web app trusted each bill's *stored* balance, so a
  payment / return / edit / delete on an older bill only reached later bills after the user re-saved them by hand.
  * **New bill** (sales + purchase): the previous balance is computed from the ledger at the bill's date and number —
    not from stored figures — so it is right even when older bills were never refreshed. It is re-read when the
    customer / supplier, the bill number or the date changes, and a back-dated bill gets the balance of the bill
    before its date. A party without bills starts from its `openingBalance` (customer or supplier record).
  * **Any change** — save, edit, history payment / undo, return / undo, delete to and restore from the recycle bin —
    re-syncs that party's whole chain from fresh Firestore reads (`db.syncSalesLedger` / `db.syncPurchaseLedger`) and
    writes, in one atomic batch, only the derived fields that are off (`previousBalance`, `grandTotal`, `balanceDue`,
    `totalReturns`, `adjustedBalanceDue`; for purchases also the nested `payment.balanceDue`). A bill moved to another
    party re-syncs the old party too; deleting a party's first bill passes its opening balance to the next one.
  * **Editing an old bill** loads its previous balance from the ledger (stale stored figures are replaced; if the
    ledger cannot be read the stored figure is kept). After saving, the screen shows the value the sync stored.
  * Behaviour changes worth knowing: old invoices of a party are corrected the first time anything of that party
    changes (they may have carried inflated / stale balances because of the web quirks); `balanceDue` no longer has
    returns subtracted (they are in `adjustedBalanceDue`, as everywhere else); purchase bills gain the top-level
    `balanceDue` so the original web app reads the right figure too. Per-bill "Opening Balance" entries are still
    added on top of the carried balance — if they were ever typed in to *compensate* a wrong carried balance, those
    bills now count it twice and should be cleared.

* **WhatsApp statement text** — the web source had corrupted characters (U+FFFD and `?` where emoji used to be). The
  message was rebuilt with proper emoji; the wording and numbers are unchanged.
* **WhatsApp phone numbers** — a 10-digit number that starts with `91` (e.g. `9123456789`) now gets the country code; the
  web version skipped it and the chat never opened.
* **Purchase payment deletion** no longer calls the *sales* ledger recomputation with the supplier's name
  (`Utils.updateSubsequentInvoices(supplierName, …)`), which could modify a sales customer with the same name.
* **Overwrite protection** — saving a *new* bill whose number already exists now asks for confirmation. The web app
  silently overwrote the existing document.
* **Negative totals in words** — a negative grand total prints "Rupees Minus … Only" instead of "Rupees  Only".
* **Initial payment date** uses the local calendar date (the web used the UTC date, which is "yesterday" in India before
  05:30).
* **Line numbers (`sno`)** are sequential among the saved lines (the web numbered by form row, leaving gaps after blank rows).
* **Edit purchase no longer renumbers the bill.** The web showed/saved a "cleaned" number (strip `P-`, pad to 3 digits),
  so editing `P-5` or `5` wrote a *new* document and left the original (possibly overwriting a real `005`). The stored
  number is used for lookup and save now.
* **Renaming a supplier** only updates the three supplier fields on its bills (`updatePurchaseBillFields`); the web
  re-saved whole bills, resetting `timestamp`/`createdAt` and reshuffling history.
* **Edit-purchase autocomplete** no longer resets the rate to 0 when a shortcut is picked (no shortcut stores a rate).
* **Customer reminder balance** (Customer Details → WhatsApp reminder) uses the same balance as the list (bill − paid −
  returns − discount); the web dialog ignored the discount and could ask for money already waived. The web's reminder
  dialog also had a broken event wiring (`getElementById('testMessage')` did not exist), so its send button likely did nothing.
* **Total Balance colour** on Customer Details is red when owing / green when in credit (the web card was always green).
* **Phone validity** counts digits (≥10); the web counted characters, so punctuation could pad a number.
* **`additionalPaymentsTotal`** (payments added from history) no longer leaks into the next new bill.
* **Generate** on the sales bill no longer runs twice (the web registered two click handlers; the second skipped the saved check).
* **Delete customer** wording: invoices are moved to the Recycle Bin (the web said "permanently delete").
* **Printing / PDF** — the invoice and statements are rendered from HTML and printed through the browser's print dialog ("Save as PDF" included); the original needed html2canvas + jsPDF from a CDN. WhatsApp sharing still opens a `wa.me` chat with the statement text (also copied to the clipboard).
* **Offline** — as in the original, Firestore's IndexedDB cache is enabled (multi-tab); the PWA shell is also precached so the app opens offline. Writes need a connection.

## 3. Security (unchanged from the web app — please read)

* The login is a **client-side check** against two hard-coded base64 strings, copied from the web app so both accept the
  same credentials. It protects the UI only.
* `firestore.rules` allows `read, write: if true`. Anyone with the (public) Firebase config can read or modify all
  business data directly. Recommended next step: Firebase Authentication + rules that require `request.auth != null`.
* The new app and the old site share this exposure. Logging out clears the in-memory cache.

## 4. More fixes made while porting individual screens

**Purchase history (`src/features/history/purchase`)**
* *Undo all payments* subtracted the nested initial split a second time (an 8000 bill with 5000 paid ended at
  `amountPaid -5000`, `balanceDue 13000`). The bill is now reset directly to "nothing paid".
* Undoing the synthetic "initial" payment of a bill that only has the nested `payment` object produced a negative
  `amountPaid`; deleting an initial payment document left the nested split behind so it reappeared. Both fixed.
* Supplier statements now include returns (the live web code hard-coded `totalReturns = 0`, although the page adds and
  undoes returns) so statements agree with the bill cards. Purchase returns no longer trigger the *sales* ledger recompute.

**Sales history (`src/features/history`)**
* Deleting an invoice says it was **moved to the Recycle Bin and can be restored** (the web said "permanently deleted").
  The type-the-number safety step is kept.
* Two return lines for the same product are checked together against the quantity sold; payment/return/statement lists
  are shown chronologically; the invoice card honours the legacy `discount` field.

**Recycle bins**
* The purchase bin's "Purchase Bills Only" filter used the value `Purchase Bill` while items are typed
  `purchase_invoice`, so it hid everything; bin search also matched the button captions ("view", "restore").
* Items without `deletedAt` showed 1 Jan 1970 ("20,000 days ago"); purchase bin Paid/Balance read top-level fields that
  new purchase bills don't have, so they showed 0.

**Overview**
* Stock-history dialog indexed the full list with a filtered-list index, so after a search it showed the wrong product.
* "Today's Total" on Expenses used the UTC date (yesterday between midnight and 05:30 IST); it now uses the local date.
* Shortcut edit compared the key case-sensitively, so `sh` → `SH` deleted and re-created the same document.
* New: long lists render 100 rows at a time with "Show more" (tables/grids are not virtualised); totals always use the
  full filtered list.

**Everywhere:** amounts use Indian grouping (`₹1,23,456.00`), dates are formatted without `Intl`, emoji/text corrupted in
the old source files (U+FFFD / `?`) were rebuilt, and WhatsApp numbers get the `91` prefix only for bare 10-digit numbers.

## 5. Where the original code is

The original HTML/JS application is preserved in git history (the commit before the React conversion). Every
`PARITY NOTE` comment that mentions `js/…` or a `*.html` file refers to it.
