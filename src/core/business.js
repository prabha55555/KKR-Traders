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
import { isAdminUnlocked } from '@/core/admin';
import { DEFAULT_MODULE_PLAN, isModulePlan, moduleInPlan } from '@/core/modules';
import { scopedKey } from '@/core/projectScope';
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
  /** logo as a png / jpeg / webp image data URL (see safeLogo); '' = no logo */
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
  // ---- modules (administrator)
  /** which modules this client has: 'basic' | 'processing' | 'all' (see core/modules.js) */
  modulePlan: DEFAULT_MODULE_PLAN,
});

const CACHE_KEY = scopedKey('business_settings_v1');
const FIELDS = Object.keys(DEFAULT_BUSINESS);

/** The only logo values that are accepted: a png / jpeg / webp image as a base64 data URL. */
const LOGO_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/** Is this a logo value that is safe to put in an <img src> of a printed page? */
export const isSafeLogo = (value) => typeof value === 'string' && LOGO_PATTERN.test(value);
/** The value if it is a safe logo, else '' (no logo; also what an old stored 'bundled' value becomes). */
export const safeLogo = (value) => (isSafeLogo(value) ? value : '');

/** Only known fields, as trimmed strings (multi-line text keeps its line breaks), on top of the defaults. */
export function normalizeBusiness(values = {}) {
  const out = { ...DEFAULT_BUSINESS };
  FIELDS.forEach((k) => {
    if (values[k] === undefined || values[k] === null) return;
    out[k] = String(values[k]).trim();
  });
  if (!isModulePlan(out.modulePlan)) out.modulePlan = DEFAULT_MODULE_PLAN;
  // the logo is written into printed HTML: anything but an image data URL is dropped
  out.logo = safeLogo(out.logo);
  return out;
}

// ------------------------------------------------------------------ the copy on this device (offline start)
function readCache() {
  try {
    const raw = storage.get(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
/**
 * Keeps a copy of the SAVED details on this device. If it cannot be written (storage full — e.g. a large logo), the
 * older copy is removed rather than left behind: an out-of-date copy must never come back on the next start.
 */
function writeCache(values) {
  try {
    // storage.set reports a refused write (quota) with false instead of throwing
    if (values && storage.set(CACHE_KEY, JSON.stringify(values))) return;
    storage.remove(CACHE_KEY);
  } catch {
    // storage blocked: nothing kept
  }
}

// ------------------------------------------------------------------ current details + listeners
const cached = readCache();
// NOTE (fresh device, database unreadable): with no copy on the device the details are the defaults, i.e. module plan
// 'all' (the plan of installations from before plans existed). That is deliberate (a locked-out client is worse than a
// brief extra menu), and it is never written to the device copy: only a successful read (applyStored) caches anything,
// so the real plan applies as soon as the database can be read.
let current = normalizeBusiness(cached ?? {});
/** true once the business has saved its details (a stored copy was read) */
let configured = Boolean(cached?.name);
/**
 * Where the current details come from: 'device' (the copy on this device / nothing yet), 'database' (read from the
 * business's database — the only state the Settings page may save from) or 'failed' (the database could not be read).
 */
let source = 'device';
const listeners = new Set();
let loading = null;

function publish(values, isConfigured, from) {
  current = normalizeBusiness(values);
  configured = isConfigured;
  if (from) source = from;
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
/** False until the business details have been saved on the Settings page. */
export function isBusinessConfigured() {
  return configured;
}
/** 'device' | 'database' | 'failed' — see `source` above. */
export function businessSource() {
  return source;
}
/** Subscribe to changes; returns the unsubscribe function. */
export function subscribeBusiness(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A stored settings document (or null = none saved yet) becomes the current details everywhere. */
function applyStored(stored) {
  if (stored) {
    publish(stored, true, 'database');
    writeCache(current);
  } else {
    // nothing saved for this business yet: blank (never another business's or built-in details)
    publish({}, false, 'database');
    writeCache(null);
  }
}

/**
 * Reads the details from the business's database (concurrent calls share the read) and makes them current
 * everywhere. Resolves `{ ok: true }`, or `{ ok: false }` when the database could not be read — the copy on this device
 * stays in use for bills, but the Settings page must not save from it (it may be out of date).
 */
export function loadBusiness() {
  if (!loading) {
    loading = (async () => {
      try {
        const { db } = await import('@/core/db');
        await db.init();
        applyStored(await db.getBusinessSettings());
        return { ok: true, values: current };
      } catch (e) {
        console.warn('Business settings could not be read; using the copy on this device.', e);
        publish(current, configured, 'failed');
        return { ok: false, values: current };
      }
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

let stopWatching = null;
/**
 * Live updates: from now on every change to the business's settings document — saved in this tab, another tab or on
 * another device — becomes current at once (titles, dashboard, menus, bills). Call once at start-up; returns the stop
 * function. A snapshot that only comes from the offline cache never blanks the details.
 */
export function watchBusiness() {
  if (stopWatching) return stopWatching;
  let stop = () => {};
  (async () => {
    try {
      const { db } = await import('@/core/db');
      await db.init();
      stop = db.watchBusinessSettings(
        (stored, { fromCache }) => {
          if (!stored && fromCache) return;
          applyStored(stored);
        },
        (e) => console.warn('Live business settings updates stopped.', e),
      );
    } catch (e) {
      console.warn('Live business settings updates are not available.', e);
    }
  })();
  stopWatching = () => {
    stop();
    stopWatching = null;
  };
  return stopWatching;
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
  if (values?.modulePlan && !isModulePlan(String(values.modulePlan).trim())) {
    errors.modulePlan = 'Please choose one of the module plans.';
  }
  if (v.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i.test(v.gstin)) {
    errors.gstin = 'GST number should be 15 characters, like 33ABCDE1234F1Z5.';
  }
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))
    errors.email = 'Please enter a valid e-mail address.';
  if (v.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(v.bankIfsc)) {
    errors.bankIfsc = 'IFSC should be 11 characters, like SBIN0001234.';
  }
  if (v.logo && v.logo.length > 900_000) {
    errors.logo = 'The logo image is too large. Please choose a smaller picture.';
  }
  return errors;
}

/** How long a database call may take before saving gives up (offline, a write never settles). */
export const SAVE_TIMEOUT_MS = 15_000;
const SAVE_TIMEOUT_MESSAGE =
  'Saving is taking too long — you may be offline. Please check your internet connection and try again.';

/** The promise's result, or a rejection after `ms` (the timer never keeps running afterwards). */
function withTimeout(promise, ms = SAVE_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(SAVE_TIMEOUT_MESSAGE)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Saves the details (Settings page) and makes them current everywhere at once. Throws on invalid input, when the
 * administrator is not signed in, and when the database does not answer within SAVE_TIMEOUT_MS (offline): the page
 * then shows the message and the administrator retries.
 *
 * `changed` (field names the user edited): the stored document is re-read and only those fields are put on top of it,
 * so fields changed elsewhere in the meantime (e.g. the module plan) are not reverted by an old form. Without it the
 * whole `values` document is written.
 */
export async function saveBusiness(values, { changed } = {}) {
  if (!isAdminUnlocked())
    throw new Error('Only the administrator can save Settings. Please unlock Settings again.');
  const check = (v) => {
    const clean = normalizeBusiness(v);
    const errors = validateBusiness(clean);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    clean.gstin = clean.gstin.toUpperCase();
    clean.bankIfsc = clean.bankIfsc.toUpperCase();
    return clean;
  };
  let clean = check(values);
  const { db } = await import('@/core/db');
  await db.init();
  if (Array.isArray(changed)) {
    const stored = await withTimeout(Promise.resolve(db.getBusinessSettings()));
    if (stored) {
      const edits = Object.fromEntries(changed.filter((k) => FIELDS.includes(k)).map((k) => [k, clean[k]]));
      clean = check({ ...stored, ...edits });
    }
  }
  // the whole document is written (every field), so nothing old can survive next to the new details
  await withTimeout(Promise.resolve(db.saveBusinessSettings(clean)));
  writeCache(clean);
  publish(clean, true, 'database');
  return clean;
}

/** Is this module in the client's plan? (menu, dashboard and addresses follow it; the dashboard is always on) */
export const isModuleEnabled = (moduleId, b = current) => moduleInPlan(moduleId, b.modulePlan);

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

/** File / document name prefix of printed bills and statements: the business's initials ("GT"), else "BILL". */
export const documentPrefix = (b = current) => monogramOf(b).replace(/[^A-Z0-9]/gi, '') || 'BILL';

/** Test helper: replace the current details (no Firestore). */
export function setBusinessForTests(values, isConfigured = true, from = 'database') {
  publish(values, isConfigured, from);
}
