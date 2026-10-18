/**
 * HistorySheet – the dialog used by every history panel (bottom sheet on phones, centred dialog from `sm` up).
 *
 * Props: open (bool) · onClose() · title (string) · children · actions (node: sticky footer buttons) ·
 *        size ('sm' | 'md' | 'lg', default 'md') · dismissable (bool, default true).
 */
import { Modal } from '@/ui';

export function HistorySheet({ open, onClose, title, children, actions, size = 'md', dismissable = true }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={actions} size={size} dismissable={dismissable}>
      {children}
    </Modal>
  );
}
