import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatsGrid } from '@/features/customerDetails/StatsGrid';

const stats = (over = {}) => ({
  totalCustomers: 3,
  totalInvoices: 7,
  totalCurrentBillAmount: 5000,
  totalPaid: 2000,
  totalDiscountAmount: 0,
  totalReturns: 250,
  pendingBalance: 2750,
  ...over,
});

describe('Customer Details stat cards (app StatCard, status colours)', () => {
  it('paid is green, returns amber, an owed balance red, counts blue', () => {
    render(<StatsGrid stats={stats()} />);
    expect(screen.getByText('₹2,000.00')).toHaveClass('text-emerald-700');
    expect(screen.getByText('-₹250.00')).toHaveClass('text-amber-700');
    expect(screen.getByText('₹2,750.00')).toHaveClass('text-red-600');
    expect(screen.getByText('7')).toHaveClass('text-sky-700');
    // 7 cards (with returns): 2 per row on phones, 4 on desktops
    expect(screen.getByText('Total Customers').closest('.grid')).toHaveClass('grid-cols-2', 'lg:grid-cols-4');
  });

  it('a credit balance is green', () => {
    render(<StatsGrid stats={stats({ totalReturns: 0, pendingBalance: -100 })} />);
    expect(screen.getByText('₹-100.00')).toHaveClass('text-emerald-700');
  });
});
