/**
 * Brightlight Solutions branding — the one place company details are defined.
 * Printed invoices, statements and WhatsApp messages read from here; empty contact fields are simply left out.
 */
export const COMPANY = {
  name: 'SANTHAMANI TEXTILES',
  displayName: 'Santhamani Textiles',
  tagline: '',
  /** short monogram printed in the invoice watermark */
  monogram: 'SS',
  address: 'No.16/1, 25A, Thirumalai Nagar South, 1st Street, TIRUPUR - 641 602.',
  cell: '90872 93268, 9092779599',
  email: '',
  website: '',
  hours: '',
  /** "Payment No" printed under the amount in words, for customers paying to the account (omitted when empty) */
  paymentNo: '90872 93268, 9092779599',
  /** shown in the WhatsApp statement footer (omitted when empty) */
  whatsappLocation: 'Tirupur',
  whatsappPhones: '90872 93268, 9092779599',
  /** software credit appended to invoices and WhatsApp messages */
  creditName: 'Santhamani Textiles',
  creditPhone: '90872 93268',
};

/** Product name shown in the app chrome, PWA manifest and page titles. */
export const PRODUCT = {
  name: 'Santhamani Textiles Billing',
  suite: 'Billing & Invoice Management',
};

/** What the company builds — used on the login / dashboard hero. */
export const SERVICES = ['Billing & Finance', 'ERP', 'CRM', 'Mobile Applications', 'Web Software'];

export const CREDIT_LINE = `Software created by Sabarish R. | For custom billing solutions, contact: 7845081278`;
/** Country calling code prepended to 10-digit Indian numbers for wa.me links. */
export const COUNTRY_CODE = '91';
