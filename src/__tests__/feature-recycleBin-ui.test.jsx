import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BinItemCard, BinRowActions } from '@/features/recycleBin/BinItemCard';

const item = {
  id: 'x1',
  type: 'invoice',
  invoiceNo: '101',
  customerName: 'Ravi Stores',
  invoiceDate: '2026-09-30',
  grandTotal: 1000,
  deletedAt: '2026-10-17T10:00:00Z',
};

describe('recycle bin actions use the app action colours', () => {
  it('card: View = sky, Restore = green, Delete = red; each fires its action', () => {
    const onView = vi.fn();
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    render(
      <BinItemCard
        item={item}
        now={new Date('2026-10-19T10:00:00Z')}
        onView={onView}
        onRestore={onRestore}
        onDelete={onDelete}
      />,
    );
    const view = screen.getByRole('button', { name: /^View / });
    const restore = screen.getByRole('button', { name: /^Restore / });
    const remove = screen.getByRole('button', { name: /permanently$/ });
    expect(view).toHaveClass('bg-sky-50');
    expect(restore).toHaveClass('bg-emerald-50');
    expect(remove).toHaveClass('bg-red-50');
    fireEvent.click(view);
    fireEvent.click(restore);
    fireEvent.click(remove);
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('table row: the same colours, compact', () => {
    render(<BinRowActions item={item} onView={() => {}} onRestore={() => {}} onDelete={() => {}} />);
    expect(screen.getByRole('button', { name: /^View / })).toHaveClass('bg-sky-50');
    expect(screen.getByRole('button', { name: /^Restore / })).toHaveClass('bg-emerald-50');
    expect(screen.getByRole('button', { name: /permanently$/ })).toHaveClass('bg-red-50');
  });
});
