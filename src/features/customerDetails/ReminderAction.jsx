import { MessageCircle } from 'lucide-react';

import { Button, IconButton } from '@/ui';
import { canSendReminder } from './reminder';

const NO_REMINDER = 'No balance/phone';

/**
 * The customer row action: WhatsApp payment reminder. `dense` (table) = a WhatsApp icon button; otherwise (card) a
 * full-width "Send Reminder" button. When no reminder applies (nothing owed or no phone) a muted note takes its place.
 */
export function ReminderAction({ customer, onRemind, dense }) {
  if (!canSendReminder(customer)) {
    return dense ? (
      <span className="text-slate-300" title={NO_REMINDER}>
        <span aria-hidden>—</span>
        <span className="sr-only">{NO_REMINDER}</span>
      </span>
    ) : (
      <span className="block text-center text-xs font-medium text-slate-400">{NO_REMINDER}</span>
    );
  }
  const label = `Send WhatsApp payment reminder to ${customer.name}`;
  if (dense) {
    return (
      <IconButton icon={MessageCircle} variant="whatsapp" label={label} onClick={() => onRemind(customer)} />
    );
  }
  return (
    <Button
      variant="whatsapp"
      icon={MessageCircle}
      fullWidth
      onClick={() => onRemind(customer)}
      aria-label={label}
    >
      Send Reminder
    </Button>
  );
}
