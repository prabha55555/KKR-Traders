import { useState } from 'react';
import { formatInvoiceNo } from '@/core/format';
import { useAppNavigate } from '@/hooks/useRouteParams';
import { Button } from './Button';
import { Modal } from './Modal';

export function TotalInvoicesClickable({ count, invoiceNumbers, entityName, module }) {
  const [isOpen, setIsOpen] = useState(false);
  const nav = useAppNavigate();

  if (!count || count === '0' || !invoiceNumbers?.length) {
    return <span>{count}</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`View the ${count} invoices of ${entityName}`}
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg font-semibold text-brand-600 underline-offset-2 hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        {count}
      </button>
      <Modal open={isOpen} onClose={() => setIsOpen(false)} title={`${entityName}'s Invoices`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {invoiceNumbers.map((inv) => (
            <Button
              key={inv}
              variant="outlineInfo"
              onClick={() => {
                setIsOpen(false);
                nav.push(`/${module}/history?search=${inv}`);
              }}
            >
              {formatInvoiceNo(inv)}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}
