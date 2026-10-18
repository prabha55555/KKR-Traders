# Brightlight Billing — Architecture

React 19 (JSX) + Tailwind CSS 4 + Vite 8, installable as a **PWA** (Android / iOS / desktop). One codebase, one
Firestore project. Visual language: [`DESIGN.md`](./DESIGN.md).

```
src/
  main.jsx                 entry: Router → Auth → Feedback → routes
  app/                     shell: routes.jsx · ModuleLayout (sidebar / bottom tabs) · Login · Dashboard · PWA helpers
  core/                    business logic — plain JS, no React, no DOM
    firebase.js db.js      Firestore data layer (same method names / collections / ids as the original app's db.js)
    billing.js format.js   totals, balances, invoice numbering · Indian-grouped currency, dates, number-to-words
    auth.js branding.js    login rules · company details printed on invoices
    services/              salesBill · purchaseBill · invoiceHtml · invoiceShare · whatsapp
  platform/                the ONLY code that touches the browser: print, download, share, clipboard, links, storage
  ui/                      design system (Tailwind): Button, fields, Card, Modal, DataTable, Feedback, Layout …
  hooks/                   useBreakpoint · useFocusLoad · useShortcuts · useRouteParams · useDebounced · useOnlineStatus
  features/<name>/         one folder per area: *Page.jsx screens + the logic/hooks they use
  styles/index.css         Tailwind import + design tokens (@theme)
  __tests__/               vitest unit tests for core + feature logic
```

## Routes

| Path | Screen |
| --- | --- |
| `/login`, `/` | Login, dashboard |
| `/purchase/bill` · `history` · `add-supplier` · `suppliers?phone=` · `bin` · `edit/:invoiceNo` | Purchase module |
| `/dyeing/batches` · `new` | Dyeing & Processing module |
| `/sales/bill?edit=<no>` · `history` · `add-customer?phone=` · `customers` · `bin` | Sales module |
| `/finance/accounts` · `records` · `settled` · `lenders` | Finance module |
| `/overview/revenue` · `statistics` · `stocks` · `expenses` · `shortcuts` | Overview module |

All pages are lazy-loaded (`app/routes.jsx`). Sign-in is guarded by `RequireAuth`.

## Responsive design

* Tailwind breakpoints: phones `< 640px`, tablets `sm/md`, desktop `lg ≥ 1024px`.
* Desktop: left sidebar. Phones/tablets: sticky header + **bottom tab bar**; inputs are 16px (no iOS zoom) and touch
  targets are ≥ 44px; safe-area insets are respected (`pb-safe`, `pt-safe`).
* Tables become cards on phones (`ui/DataTable`), modals become bottom sheets (`ui/Modal`).

## PWA

`vite-plugin-pwa` (generateSW): app shell precached → opens offline; manifest with install icons + shortcuts;
update prompt (`app/pwa.jsx → UpdatePrompt`) so a half-typed bill is never reloaded under the user; `InstallButton`
on the dashboard; offline banner. Firestore data is cached in IndexedDB (`persistentLocalCache`, multi-tab) exactly
like the original site's `enablePersistence({ synchronizeTabs: true })`.

## Data layer (`@/core/db`)

`import { db } from '@/core/db'` — singleton with the same method names as the original app's `db.js`
(`getAllInvoices`, `saveInvoice`, `getPaymentsByInvoice`, `moveInvoiceToRecycleBin`, `getAllPurchaseBills`, …).

* `getAll*` lists are cached in memory; every write invalidates what it touches. After a write done outside `db`
  call `db.invalidate('invoices', …)`; the refresh button uses `db.invalidateAll()`.
* **Never write to the real Firestore from tests or manual checks** — it is the live business database. Unit tests
  spy on `db` methods (`jest.spyOn(db, 'getAllInvoices')`) and `firebase/*` is mocked in `src/test/setup.js`.
* Document shapes, collection names and ids must stay identical to the original data.

## UI kit (`@/ui`) — quick reference

* `Button` (`variant`: primary success danger warning info secondary purple whatsapp outline outlineDanger ghost subtle;
  `icon={LucideComponent}`, `loading`, `size` sm/md/lg, `fullWidth`), `IconButton`.
* Fields call `onChange(value)` with the **string value** (not the event): `TextField`, `NumberField` (string state,
  decimal keyboard), `DateField` (`YYYY-MM-DD`), `TextArea`, `SelectField` (`options=[{value,label}]`), `Checkbox`,
  `SearchBar`. Pass `label`, `error`, `hint`, `leftIcon`, `right`; other props go to the `<input>`.
* `Card`, `SectionHeader`, `Divider`, `Badge`, `KeyValue`, `StatCard`, `Page` (title row + width), `TwoPane`
  (form | sticky summary), `Grid`, `ChoiceChips`, `Modal`/`Sheet`, `DataTable`, `EmptyState` / `LoadingState` /
  `ErrorState` / `Skeleton`.
* `useFeedback()` → `toast(title, message, 'success'|'error'|'warning'|'info')`, `await confirm({title, message,
  tone:'danger', confirmText})`, `loading.run(message, asyncFn, subtext)`.
* Icons: `lucide-react`. Style with Tailwind utilities and the `brand-*` palette (`bg-brand-600`).

## Conventions

* JavaScript + JSX only. Components are function components; pages are the **default export** of `*Page.jsx`.
* Use the helpers in `@/core/format` (`formatCurrency`, `formatDateIN`, `toNum`, `todayISO` …) — never `Intl` /
  `toLocaleString` / `new Date('YYYY-MM-DD')` for display.
* Browser features go through `@/platform` (`printHtml`, `downloadFile`, `shareText`, `copyText`, `openExternal`,
  `storage`). No `window` / `document` / `localStorage` in `core/`.
* Destructive actions go through `confirm()`; success/error through `toast()`; slow writes through `loading.run()`.
* Primary actions stay reachable on phones (sticky bottom action bar) and keyboards work on desktop (Enter submits).
* Verify with `npm test` and `npm run build`.

## Preserved original quirks

The business rules were ported 1:1; where the original looks buggy the behaviour is kept and listed in
[`MIGRATION_NOTES.md`](./MIGRATION_NOTES.md) — ask before "fixing" them.
