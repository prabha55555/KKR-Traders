/**
 * Brightlight Solutions — the company that MAKES this billing app: its name, the software credit printed on bills and
 * messages, its contact and the product name. The same in every installation.
 *
 * The business that USES the app (its name, address, phone, GST number, logo, bill texts …) is NOT here: it is set on
 * the Settings page and stored in that business's own database — see core/business.js.
 */
export const VENDOR = {
  name: 'Brightlight Solutions',
  /** person named in the software credit */
  creditName: 'Sabarish R.',
  phone: '7845081278',
  phoneDisplay: '+91 78450 81278',
  tagline: 'Technology That Moves Business Forward',
  email: 'contact@brightlightsolutions.in',
  website: 'www.brightlightsolutions.in',
  websiteUrl: 'https://www.brightlightsolutions.in',
  address: 'Kamatchi Amman Kovil Street, Kumarananthapuram, Tiruppur, Tamil Nadu 641602, India',
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=Kamatchi+Amman+Kovil+Street,+Kumarananthapuram,+Tiruppur,+Tamil+Nadu+641602,+India',
  hours: 'Business hours: 24 Hours',
};

/** Product name shown in the app chrome, PWA manifest and page titles. */
export const PRODUCT = {
  name: 'Brightlight Billing',
  suite: 'Billing & Invoice Management',
};

/** What Brightlight Solutions builds — used on the login / dashboard hero. */
export const SERVICES = ['Billing & Finance', 'ERP', 'CRM', 'Mobile Applications', 'Web Software'];

/** Software credit appended to bills, statements and shared messages. */
export const CREDIT_LINE = `Software created by ${VENDOR.creditName} | For custom billing solutions, contact: ${VENDOR.phone}`;
/** Country calling code prepended to 10-digit Indian numbers for wa.me links. */
export const COUNTRY_CODE = '91';
