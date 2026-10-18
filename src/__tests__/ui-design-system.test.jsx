import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE_MAX_AGE_MS, db } from '@/core/db';
import { Badge, Button, DataTable, IconButton, StatCard, StatGrid, statusTone } from '@/ui';

afterEach(() => vi.useRealTimers());

describe('status colours (one map for the whole app)', () => {
  it.each([
    ['Paid', 'success'],
    ['Settled', 'success'],
    ['COMPLETED', 'success'],
    ['Done · lot received', 'success'],
    ['No due', 'success'],
    ['Partially paid', 'warning'],
    ['Pending', 'warning'],
    ['Coming from dyeing', 'warning'],
    ['Unpaid', 'danger'],
    ['Overdue', 'danger'],
    ['Rejected', 'danger'],
    ['Failed', 'danger'],
    ['AT_DYEING', 'info'],
    ['In combing', 'info'],
    ['Processing', 'info'],
    ['', 'neutral'],
    ['Something else', 'neutral'],
  ])('%s -> %s', (text, tone) => {
    expect(statusTone(text)).toBe(tone);
  });

  it('a badge takes its colour from its status', () => {
    render(
      <>
        <Badge status="Paid" />
        <Badge status="Unpaid">Due ₹500</Badge>
        <Badge tone="info">Forced</Badge>
      </>,
    );
    expect(screen.getByText('Paid').parentElement).toHaveClass('bg-emerald-50');
    expect(screen.getByText('Due ₹500').parentElement).toHaveClass('bg-red-50');
    expect(screen.getByText('Forced').parentElement).toHaveClass('bg-sky-50');
  });
});

describe('status cards', () => {
  it('share one design; the tone colours the icon and the figure', () => {
    const Icon = (props) => <svg {...props} />;
    render(
      <StatGrid cols={3}>
        <StatCard icon={Icon} value="₹1,000.00" label="Received" tone="success" />
        <StatCard icon={Icon} value="₹200.00" label="Due" tone="danger" hint="2 bills" />
      </StatGrid>,
    );
    expect(screen.getByText('₹1,000.00')).toHaveClass('text-emerald-700');
    expect(screen.getByText('₹200.00')).toHaveClass('text-red-600');
    expect(screen.getByText('2 bills')).toBeInTheDocument();
    expect(screen.getByText('Received').closest('.grid')).toHaveClass('grid-cols-2', 'sm:grid-cols-3');
  });
});

describe('buttons always carry a colour', () => {
  it('icon buttons default to the tinted brand style, not a bare ghost', () => {
    const Icon = (props) => <svg {...props} />;
    render(
      <>
        <IconButton icon={Icon} label="Print" />
        <Button variant="neutral">Cancel</Button>
        <Button variant="outlineSuccess">Pay</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Print' })).toHaveClass('bg-brand-50');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('bg-slate-100');
    expect(screen.getByRole('button', { name: 'Pay' })).toHaveClass('bg-emerald-50');
  });
});

describe('tables', () => {
  it('use the bordered app table; right-aligned columns are marked for one-line numbers', () => {
    render(
      <DataTable
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'amount', header: 'Amount', align: 'right' },
        ]}
        rows={[{ name: 'Ravi', amount: '₹10.00' }]}
        rowKey={(r) => r.name}
      />,
    );
    const table = screen.getByRole('table');
    expect(table).toHaveClass('erp-table');
    expect(table.parentElement).toHaveClass('erp-table-wrap');
    expect(screen.getByText('₹10.00')).toHaveAttribute('data-align', 'right');
  });
});

describe('data stays fresh without a Refresh button', () => {
  it('a cached list is re-read once it is older than the cache age', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-19T10:00:00Z') });
    db.initialized = true;
    db.invalidateAll();
    const fetcher = vi.fn().mockResolvedValue(['a']);
    await db._load('test_list', fetcher);
    await db._load('test_list', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + CACHE_MAX_AGE_MS + 1);
    await db._load('test_list', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    db.invalidateAll();
  });
});

describe('status map: wording used across modules', () => {
  it.each([
    ['Part paid', 'warning'],
    ['Returned', 'warning'],
    ['Refunded', 'warning'],
    ['Oversold', 'danger'],
  ])('%s -> %s', (text, tone) => {
    expect(statusTone(text)).toBe(tone);
  });
});
