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
safe. If any required value is missing the app stops with a clear message instead of connecting to a wrong project.

## 3. Build and deploy

```bash
npm install
npx vite build --mode ganesh
```

The build prints **`Firebase project: ganesh-textiles-billing`** — make sure it is the customer's project, then deploy
the `dist/` folder to the customer's hosting (Firebase Hosting: `firebase deploy --only hosting --project
ganesh-textiles-billing`, or any static host with HTTPS — sign-in hashing needs HTTPS).

A build **without** an env file uses the original installation's project (`sriram-96e71`).

## 4. First sign-in and Settings (with the customer)

1. Open the app and sign in with the **default login** the app was installed with.
2. The dashboard shows **"Set up your business"** → **Open Settings** (or the **Settings** button / the Settings menu).
3. Fill in the business details and press **Save**:
   - Business name, tagline, greeting name, welcome heading, logo, watermark initials
   - Address, phone numbers, e-mail, website, GST number
   - Sales bill: bill heading (e.g. *TAX INVOICE*), payment number, bank details, UPI ID, terms
   - Purchase acknowledgement closing line
   - Bill sharing (WhatsApp): town and phone numbers
4. In the **Login** card set the customer's **own username and password** (stored as a secure one-way hash in their
   database). The default login stops working for them from then on.

Everything — dashboard, sales and purchase bills, printed invoices, statements, dyeing DCs, WhatsApp messages,
reminders and the purchase acknowledgement — uses these details immediately. The business owner can change them any
time on the Settings page; no new build is needed.

## What is stored where

| What | Where |
| --- | --- |
| The customer's business details | their Firestore `settings/business` document (+ a copy on each device for offline use) |
| The customer's login | their Firestore `settings/login` document (salted PBKDF2 hash — never the password itself) |
| Their customers and suppliers | their own `customers` / `suppliers` collections (unchanged) |
| Brightlight Solutions (maker) | `src/core/branding.js` — same for every customer |
| Which Firebase project a build uses | the customer's `.env.<customer>.local` file |

## The original installation (Santhamani Textiles)

It keeps working exactly as before: its project is the default, and until its owner saves the Settings page the app
shows the details it always had (name, address, phones, logo). The first **Save** stores them in its database; from
then on the Settings page is the only place they come from.

> Security note: sign-in is checked in the app, and `firestore.rules` is open. For a production rollout to many
> customers, move to Firebase Authentication with per-user rules (see the open items in `docs/ARCHITECTURE.md`).
