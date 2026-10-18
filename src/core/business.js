/**
 * The business that USES this billing app (its name, address, GST number, logo, bill texts …), set on the Settings
 * page and stored in Firestore (`settings/business`) — never in the source code, so the same build can be sold to any
 * business. Brightlight Solutions, the company that MAKES the app, stays in core/branding.js.
 *
 * Kept apart from the business's own customers and suppliers (their own collections).
 *
 * The current details are held in memory (getBusiness(), synchronous, for the bill / message builders) and copied to
 * the device so the app starts — and prints — with them offline; loadBusiness() refreshes them from Firestore and
 * saveBusiness() writes them. Screens use the useBusiness() hook (src/hooks/useBusiness.js).
 */
import { firebaseConfig } from '@/core/firebase';
import { storage } from '@/platform';

/** Every setting with its value when nothing is entered (blank = left off the bills / messages). */
export const DEFAULT_BUSINESS = Object.freeze({
  // ---- profile
  /** Business name as written ("Ganesh Textiles"); bills print it in capitals */
  name: '',
  /** short line beside the logo on bills and under the dashboard welcome */
  tagline: '',
  /** dashboard greeting "Good morning, <ownerName>" — blank = the login username */
  ownerName: '',
  /** dashboard heading — blank = "Welcome to <name>" */
  welcomeMessage: '',
  /** logo as an image data URL; '' = no logo; BUNDLED_LOGO = the logo file shipped with the app */
  logo: '',
  /** initials in the watermark of bills and statements — blank = initials of the name */
  monogram: '',
  // ---- contact & tax
  address: '',
  /** "CELL:" on bills, DCs and statements */
  phones: '',
  email: '',
  website: '',
  gstin: '',
  // ---- sales bill
  /** heading on the printed bill */
  salesBillTitle: 'ESTIMATED COPY',
  /** "Payment No :" printed under the amount in words */
  paymentNo: '',
  bankName: '',
  bankAccountNo: '',
  bankIfsc: '',
  upiId: '',
  /** lines printed above the signatures (one per line) */
  billTerms:
    'Certified that the particulars given above are true and correct\n**TERMS & CONDITIONS APPLY\n**E. & O.E.',
  // ---- purchase
  /** closing line of the purchase acknowledgement — blank = "<name> has received the products mentioned above. Thank you." */
  purchaseAckMessage: '',
  // ---- bill sharing (WhatsApp)
  /** town shown in the contact block of shared statements */
  shareLocation: '',
  /** phone numbers in shared messages — blank = the phone numbers above */
  sharePhones: '',
});

/** `logo` value meaning "the logo file that ships with the app" (what bills printed before Settings existed). */
export const BUNDLED_LOGO = 'bundled';

/**
 * Databases that were in use before the Settings page existed: their details as they were hard-coded then, so those
 * businesses see no change until they edit Settings (the first Save stores them in Firestore). A new database starts
 * blank and is set up on the Settings page.
 */
const LEGACY_DETAILS = {
  'sriram-96e71': {
    name: 'Santhamani Textiles',
    logo: BUNDLED_LOGO,
    monogram: 'SS',
    address: 'No.16/1, 25A, Thirumalai Nagar South, 1st Street, TIRUPUR - 641 602.',
    phones: '90872 93268, 9092779599',
    paymentNo: '90872 93268, 9092779599',
    shareLocation: 'Tirupur',
    sharePhones: '90872 93268, 9092779599',
  },
};

const CACHE_KEY = 'business_settings_v1';
const FIELDS = Object.keys(DEFAULT_BUSINESS);

/** Only known fields, as trimmed strings (multi-line text keeps its line breaks), on top of the defaults. */
export function normalizeBusiness(values = {}) {
  const out = { ...DEFAULT_BUSINESS };
  FIELDS.forEach((k) => {
    if (values[k] === undefined || values[k] === null) return;
    out[k] = String(values[k]).trim();
  });
  return out;
}

/** The legacy details of this database, or null for a new one. */
export function legacyDetails(projectId = firebaseConfig.projectId) {
  return LEGACY_DETAILS[projectId] ?? null;
}

function readCache() {
  try {
    const raw = storage.get(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(values) {
  try {
    storage.set(CACHE_KEY, JSON.stringify(values));
  } catch {
    // a full / blocked storage only costs the offline copy
  }
}

let current = normalizeBusiness(readCache() ?? legacyDetails() ?? {});
/** true once the business has saved its own details (or a database copy was read) */
let configured = Boolean(readCache()?.name);
const listeners = new Set();
let loading = null;

function publish(values, isConfigured) {
  current = normalizeBusiness(values);
  configured = isConfigured;
  listeners.forEach((fn) => {
    try {
      fn(current);
    } catch (e) {
      console.error('business settings listener failed', e);
    }
  });
}

/** The current business details (always every field, see DEFAULT_BUSINESS). */
export function getBusiness() {
  return current;
}
/** False until the business has saved its details on the Settings page (a legacy database counts as set up). */
export function isBusinessConfigured() {
  return configured || Boolean(legacyDetails());
}
/** Subscribe to changes; returns the unsubscribe function. */
export function subscribeBusiness(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Reads the details from Firestore (once per call; concurrent calls share the read). No document yet: the legacy
 * details of this database, else blank. Offline / failed read: the device copy stays in use.
 */
export function loadBusiness() {
  if (!loading) {
    loading = (async () => {
      try {
        const { db } = await import('@/core/db');
        await db.init();
        const stored = await db.getBusinessSettings();
        if (stored) {
          publish(stored, true);
          writeCache(current);
        } else {
          publish(legacyDetails() ?? readCache() ?? {}, Boolean(legacyDetails()));
        }
      } catch (e) {
        console.warn('Business settings could not be read; using the copy on this device.', e);
      }
      return current;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

/** Before printing / sharing: the details as stored (waits for a read in progress, else uses what is loaded). */
export async function businessReady() {
  if (loading) await loading;
  return current;
}

/** Problems that block saving, as { field: message } (empty object = fine). */
export function validateBusiness(values) {
  const v = normalizeBusiness(values);
  const errors = {};
  if (!v.name) errors.name = 'Please enter the business name.';
  if (v.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i.test(v.gstin)) {
    errors.gstin = 'GST number should be 15 characters, like 33ABCDE1234F1Z5.';
  }
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))
    errors.email = 'Please enter a valid e-mail address.';
  if (v.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(v.bankIfsc)) {
    errors.bankIfsc = 'IFSC should be 11 characters, like SBIN0001234.';
  }
  if (v.logo && v.logo !== BUNDLED_LOGO && v.logo.length > 900_000) {
    errors.logo = 'The logo image is too large. Please choose a smaller picture.';
  }
  return errors;
}

/** Saves the details (Settings page) and makes them current everywhere at once. Throws on invalid input. */
export async function saveBusiness(values) {
  const clean = normalizeBusiness(values);
  const errors = validateBusiness(clean);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  clean.gstin = clean.gstin.toUpperCase();
  clean.bankIfsc = clean.bankIfsc.toUpperCase();
  const { db } = await import('@/core/db');
  await db.saveBusinessSettings(clean);
  writeCache(clean);
  publish(clean, true);
  return clean;
}

// ------------------------------------------------------------------ what the bills and messages print
/** Name as printed on bills and in shared messages (capitals). */
export const printName = (b = current) => b.name.toUpperCase();
/** Watermark initials: the monogram, else the initials of the name (up to 3). */
export function monogramOf(b = current) {
  if (b.monogram) return b.monogram.toUpperCase();
  return b.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}
/** Phone numbers for shared messages. */
export const sharePhonesOf = (b = current) => b.sharePhones || b.phones;
/** Closing line of the purchase acknowledgement. */
export const purchaseAckLine = (b = current) =>
  b.purchaseAckMessage ||
  `${b.name || 'We'} ${b.name ? 'has' : 'have'} received the products mentioned above. Thank you.`;
/** Lines printed above the bill signatures. */
export const billTermLines = (b = current) =>
  b.billTerms
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
/** Bank details lines for the bill (empty when none are set). */
export function bankLines(b = current) {
  return [
    b.bankName && `Bank: ${b.bankName}`,
    b.bankAccountNo && `A/c No: ${b.bankAccountNo}`,
    b.bankIfsc && `IFSC: ${b.bankIfsc}`,
    b.upiId && `UPI: ${b.upiId}`,
  ].filter(Boolean);
}

/** Test helper: replace the current details (no Firestore). */
export function setBusinessForTests(values, isConfigured = true) {
  publish(values, isConfigured);
}
