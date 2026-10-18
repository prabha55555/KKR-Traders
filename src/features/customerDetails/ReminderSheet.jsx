import { MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { formatRupees } from '@/core/format';
import { normalizeWhatsAppPhone, openWhatsApp } from '@/core/services/whatsapp';
import { InitialAvatar } from '@/features/customerForm/InitialAvatar';
import { Button, ChoiceChips, Modal, TextArea, useFeedback } from '@/ui';
import {
  generateReminderMessage,
  messageStats,
  REMINDER_TEMPLATES,
  reminderBalance,
  withSignature,
} from './reminder';

/**
 * "Send WhatsApp Reminder" dialog: template picker, message preview, custom text, counters, open in WhatsApp.
 * `customer` = the customer being reminded; null = closed.
 */
export function ReminderSheet({ customer, onClose }) {
  const { toast } = useFeedback();
  const [template, setTemplate] = useState('standard');
  const [customText, setCustomText] = useState('');
  const [sending, setSending] = useState(false);

  // keep showing the last customer while the sheet closes
  const lastCustomer = useRef(null);
  if (customer) lastCustomer.current = customer;
  const shown = customer ?? lastCustomer.current;

  useEffect(() => {
    if (customer) {
      setTemplate('standard');
      setCustomText('');
    }
  }, [customer]);

  if (!shown) return null;

  const message = template === 'custom' ? customText : generateReminderMessage(shown, template);
  const stats = messageStats(message);

  const send = async () => {
    // a phone with no digits would open WhatsApp's chat picker
    if (!normalizeWhatsAppPhone(shown.phone)) {
      toast('Notification', 'Phone number not available for this customer.', 'info');
      return;
    }
    if (template === 'custom' && !customText.trim()) {
      toast('Message Required', 'Type your custom message first.', 'warning');
      return;
    }
    setSending(true);
    try {
      await openWhatsApp(shown.phone, withSignature(message));
      toast('WhatsApp opened with reminder message!', undefined, 'success');
      onClose();
    } catch (error) {
      console.error('Could not open WhatsApp', error);
      toast('Error', 'Could not open WhatsApp.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={customer !== null}
      onClose={onClose}
      title="Send WhatsApp Reminder"
      footer={
        <Button
          variant="whatsapp"
          icon={MessageCircle}
          loading={sending}
          onClick={send}
          className="flex-1 sm:flex-none"
        >
          Open in WhatsApp
        </Button>
      }
    >
      <div className="mb-5 flex items-center gap-3.5 rounded-2xl border border-line bg-slate-50/70 p-3.5">
        <InitialAvatar name={shown.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-brand-800">Customer: {shown.name}</p>
          <p className="text-sm text-slate-500 tabular-nums">Phone: {shown.phone || 'Not provided'}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Balance Due</p>
          <p className="font-display text-lg font-extrabold text-red-600 tabular-nums">
            {formatRupees(reminderBalance(shown))}
          </p>
        </div>
      </div>

      <p className="mb-2 text-[13px] font-semibold tracking-wide text-slate-600">Select Reminder Template:</p>
      <ChoiceChips options={REMINDER_TEMPLATES} value={template} onChange={setTemplate} />

      <p className="mt-5 mb-2 text-[13px] font-semibold tracking-wide text-slate-600">Message Preview:</p>
      <div className="rounded-2xl rounded-tl-md border border-[#c5e8b7] bg-[#e7ffdb] p-3.5 text-sm leading-5 whitespace-pre-wrap text-slate-900 shadow-sm">
        {message || <span className="text-slate-500 italic">Type a custom message below.</span>}
      </div>

      {template === 'custom' ? (
        <TextArea
          label="Custom Message:"
          value={customText}
          onChange={setCustomText}
          placeholder="Type your custom message here..."
          rows={4}
          className="mt-4"
        />
      ) : null}

      <div className="mt-3 flex justify-between text-xs font-medium text-slate-500 tabular-nums">
        <span>Characters: {stats.characters}</span>
        <span>Messages: {stats.messages}</span>
      </div>
    </Modal>
  );
}
