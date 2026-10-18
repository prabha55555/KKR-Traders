/**
 * WhatsApp payment-reminder messages — port of generateReminderMessage / updateMessageStats / sendWhatsAppReminder
 * from js/customer-details.js.
 */
import { COMPANY, CREDIT_LINE } from '@/core/branding';
import { formatRupees } from '@/core/format';
import { customerBalance } from './aggregate';
export const REMINDER_TEMPLATES = [
  { value: 'standard', label: 'Standard Payment Reminder' },
  { value: 'urgent', label: 'Urgent Payment Required' },
  { value: 'friendly', label: 'Friendly Follow-up' },
  { value: 'custom', label: 'Custom Message' },
];
/** The list only offers a reminder to customers who owe money and have a phone number. */
export function canSendReminder(customer) {
  return customerBalance(customer) > 0 && !!customer.phone;
}
/**
 * Amount quoted in the message.
 * PARITY NOTE: the web reminder dialog computed `bill - paid - returns` WITHOUT subtracting the discount, so for a
 * customer with a discount it quoted more than the list's "Balance Due" (which does subtract it) and asked for money
 * that had already been waived. The mobile port quotes the same balance the list shows.
 */
export const reminderBalance = customerBalance;
export function generateReminderMessage(customer, template) {
  const balance = formatRupees(reminderBalance(customer));
  const company = COMPANY.name;
  switch (template) {
    case 'standard':
      return `${company} - Payment Reminder

Dear ${customer.name},

Your outstanding balance is: ${balance}

Please make the payment at your earliest convenience.

This is an automated reminder`;
    case 'urgent':
      return `${company} - URGENT: Payment Required

Dear ${customer.name},

URGENT: Your payment of ${balance} is overdue.

Please clear the outstanding amount immediately to avoid any inconvenience.

*Urgent - Please respond immediately*`;
    case 'friendly':
      return `${company} - Friendly Payment Follow-up

Hi ${customer.name},

Hope you're doing well! This is a friendly reminder about your outstanding balance of ${balance}.

Please let us know if you have any questions or need more time.

Best regards,
${company} Team`;
  }
}
/** The text that is actually sent: the web appended the developer credit to every reminder (not shown in the preview). */
export function withSignature(message) {
  return `${message}\n\n${CREDIT_LINE}`;
}
/** "Characters" and "Messages" counters under the preview (one message segment per 160 characters). */
export function messageStats(message) {
  return { characters: message.length, messages: Math.ceil(message.length / 160) };
}
