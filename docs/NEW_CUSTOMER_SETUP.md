# Setting up the billing app for a new customer

Brightlight Billing is one code base for every business you sell it to. **Nothing in the source code changes per
customer.** Each customer gets:

1. **their own Firebase project** — so their bills, stock and money never mix with another business's data, and
2. **their own business details** — entered on the app's **Settings** page and stored in their own database.

Brightlight Solutions stays the maker of the app everywhere ("Powered by Brightlight Solutions", the software credit on
bills and messages); those details live in `src/core/branding.js` and are the same in every installation.

---

## 1. Create the customer's Firebase project (once per customer)

1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `ganesh-textiles-billing`).
2. **Build → Firestore Database → Create database** (production mode, region `asia-south1` for India).
3. **Firestore → Rules**: paste the rules from `firestore.rules` in this repo and publish.
4. **Project settings → Your apps → Add app → Web (`</>`)**, give it a name, and copy the `firebaseConfig` values.

## 2. Create the customer's env file (once per customer)

```bash
cp .env.example .env.ganesh.local
```

Fill in the values from step 1.4:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=ganesh-textiles-billing.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ganesh-textiles-billing
VITE_FIREBASE_STORAGE_BUCKET=ganesh-textiles-billing.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
VITE_FIREBASE_MEASUREMENT_ID=
```

Files named `.env.*.local` are not committed to git (see `.gitignore`); keep a copy of each customer's file somewhere
safe. The build **fails** (and names what is missing) when the mode is a customer mode and the file is absent, or when
only some of the required values (API key, auth domain, project id, app id) are filled in — so a build can never
silently connect to another customer's project.

## 3. Build and deploy

```bash
npm install
npx vite build --mode ganesh
```

The build prints **`Firebase project: ganesh-textiles-billing`** — make sure it is the customer's project, then deploy
the `dist/` folder to the customer's hosting (Firebase Hosting, configured by the `hosting` block of `firebase.json`:
`firebase deploy --only hosting --project ganesh-textiles-billing`, or any static host with HTTPS — sign-in hashing
needs HTTPS).

Only plain `development` / `production` builds **without** any `VITE_FIREBASE_*` use the original installation's
project (`sriram-96e71`). The login, session and business-detail copies kept on a device are namespaced by Firebase
project id, so two customers' builds on one origin never share them. (After upgrading from a build without this,
signed-in users sign in once more.)

## 4. First sign-in and Settings (with the customer)

1. Open the app and sign in with the **default login** the app was installed with.
2. Open **Settings** (dashboard button or the Settings menu). Settings is for the **administrator only** (Brightlight
   Solutions): sign in with the administrator username and password (see "Administrator login" below). The client
   only ever sees the sign-in card; the unlock lasts 30 minutes on that browser tab and ends on logout or **Lock
   Settings**.
3. **Modules** — pick the client's plan:
   - Option 1: Purchase, Sales & Overview (+ Settings)
   - Option 2: Purchase, Dyeing & Combing, Sales & Overview (+ Settings)
   - Option 3: All modules with Finance (+ Settings)

   Modules left out disappear from the menu and the dashboard, and their addresses show "not part of your plan".
   Their data is kept; switching to a larger plan brings them back.
4. Fill in the business details and press **Save settings**:
   - Business name, tagline, greeting name, welcome heading, logo, watermark initials
   - Address, phone numbers, e-mail, website, GST number
   - Sales bill: bill heading (e.g. *TAX INVOICE*), payment number, bank details, UPI ID, terms
   - Purchase acknowledgement closing line
   - Bill sharing (WhatsApp): town and phone numbers
5. In the **Client login** card set the client's **own username and password** (stored as a secure one-way hash in
   their database; the client's current password is not needed). The default login stops working for them. If the
client's login cannot be read (no connection and no copy on that device) sign-in is refused with "Could not reach the
server to verify your login — check your connection", so the default login cannot be used to get around a changed one.

Everything — the menu, dashboard, sales and purchase bills, printed invoices, statements, dyeing DCs, WhatsApp
messages, reminders and the purchase acknowledgement — uses these settings immediately. When the client needs a change
(new password, new address, another plan …), the administrator opens Settings again; no new build is needed.

## Administrator login

The administrator login is the same in every installation and is stored in `src/core/admin.js` only as a salted
PBKDF2 hash (never the password). To change the administrator password:

```bash
node scripts/admin-hash.mjs "<new password>"
```

Paste the printed `salt`, `iterations` and `passwordHash` into `ADMIN_ACCOUNT` in `src/core/admin.js` and rebuild.
Keep the administrator password private: anyone with it can change any client's settings and login.

## What is stored where

| What | Where |
| --- | --- |
| The customer's business details and module plan | their Firestore `settings/business` document (+ a copy on each device for offline use) |
| The customer's login | their Firestore `settings/login` document (salted PBKDF2 hash — never the password itself) |
| Their customers and suppliers | their own `customers` / `suppliers` collections (unchanged) |
| Brightlight Solutions (maker) | `src/core/branding.js` — same for every customer |
| The administrator login | `src/core/admin.js` (hash) — same for every customer |
| Which Firebase project a build uses | the customer's `.env.<customer>.local` file |

## No business details in the code

No business's name, address, phone, GST number or logo is written in the source code or shipped in the build — not
even the first client's (its logo file is kept outside the bundle in `docs/customer-assets/first-client-logo.png`; upload
it on the Settings page if that customer needs it). The login card shows Brightlight's own logo. A logo must be a
png / jpeg / webp image; anything else is ignored.
Every installation shows exactly what was saved on its Settings page (until then the bills have no business name and
the dashboard says the details are not set up). After **Save settings** the new details apply at once everywhere — in
this tab, other open tabs and other devices — and are kept on each device for offline use. If the saved details
cannot be loaded (no connection), the Settings page shows a warning and blocks saving, so an old copy can never
overwrite them.

> Security note: sign-in is checked in the app, and `firestore.rules` is open. For a production rollout to many
> customers, move to Firebase Authentication with per-user rules (see the open items in `docs/ARCHITECTURE.md`).
