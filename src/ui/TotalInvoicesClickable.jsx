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
        className="font-medium text-brand-600 hover:text-brand-800 hover:underline focus:outline-none"
      >
        {count}
      </button>
      <Modal open={isOpen} onClose={() => setIsOpen(false)} title={`${entityName}'s Invoices`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {invoiceNumbers.map((inv) => (
            <Button
              key={inv}
              variant="outline"
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
