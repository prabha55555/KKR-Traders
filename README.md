# Brightlight Billing

A premium billing suite by **Brightlight Solutions** — sales & purchase billing, customer / supplier ledgers, stock,
revenue and expenses, delivered as an installable **PWA** that feels the same on desktop, tablet and phone.

| | |
| --- | --- |
| UI | React 19 (JSX), React Router, Tailwind CSS 4, lucide-react icons, Inter + Plus Jakarta Sans (self-hosted) |
| Build | Vite 8, `vite-plugin-pwa` (Workbox) |
| Data | Firebase Firestore (modular SDK, IndexedDB offline cache) |
| Tests | Vitest + Testing Library |

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173  (add --host to open it from a phone on the same Wi-Fi)
npm test           # unit tests (business logic, never touches Firestore)
npm run build      # production build + service worker in dist/
npm run preview    # serve the production build locally (this is where PWA install works)
```

Login (same credentials as the original site) is checked on the device — see *Security* below.

## Project layout

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). In short:

```
src/app/        shell, routes, login, dashboard, PWA helpers
src/core/       business logic + Firestore data layer (no React / DOM)
src/platform/   browser adapters: print, download, share, clipboard, links, storage
src/ui/         Tailwind design system (Button, fields, Modal, DataTable, toasts …) — see docs/DESIGN.md
src/features/   screens grouped by area (sales bill, history, customers, purchase, overview, recycle bin)
```

## PWA

* Installable (manifest with icons + app shortcuts for Sales Bill, Purchase Bill, Overview).
* The app shell is precached, so it **opens offline**; Firestore serves its on-device cache while offline
  (changes need a connection). An offline banner is shown.
* New versions are downloaded in the background and the user chooses when to **Update** (no surprise reload while a
  bill is half typed).
* Responsive: sidebar layout on desktop, header + bottom tab bar on phones/tablets, tables turn into cards, dialogs
  into bottom sheets.

## Deploy

`vercel.json` is included (SPA rewrite + cache headers). Any static host works: build with `npm run build` and serve
`dist/` with a fallback to `index.html`. The service worker requires HTTPS (localhost is exempt).

## Configuration

Firebase uses the `billing-56b7b` project. The remaining Firebase settings can be overridden with
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, and `VITE_FIREBASE_MEASUREMENT_ID` in `.env.local`.
`VITE_FIREBASE_PROJECT_ID` is intentionally rejected if it is not `billing-56b7b`, preventing accidental writes to
the old database.

## Firestore rules (required for data to load)

The app reads and writes Firestore directly from the browser. If every page shows **"Missing or insufficient
permissions"**, the project's security rules are still the locked default and must be updated once:

* **Console:** Firebase Console → project `billing-56b7b` → Firestore Database → *Rules* → paste the contents of
  [`firestore.rules`](firestore.rules) → *Publish*.
* **CLI:** `firebase login` (with the account that owns the project), then `firebase deploy --only firestore:rules`
  (`firebase.json` and `.firebaserc` are included).

`firestore.rules` is fully open (`allow read, write: if true`), which is only acceptable for a short demo. For a
time-boxed demo use this condition instead (replace the date), and move to Firebase Authentication before real use:

```
allow read, write: if request.time < timestamp.date(2026, 11, 30);
```

## Security (inherited from the original — please read)

* The login is a **client-side check** against two base64 strings copied from the original `login.js`. It only hides
  the UI.
* `firestore.rules` allows `read, write: if true`: anyone with the (public) Firebase config can read or modify the data.
  Recommended next step: Firebase Authentication + rules that require `request.auth != null`.

## Migration notes

[`docs/MIGRATION_NOTES.md`](docs/MIGRATION_NOTES.md) lists the original behaviours that were preserved on purpose
(some look like bugs), what changed, and open questions.
