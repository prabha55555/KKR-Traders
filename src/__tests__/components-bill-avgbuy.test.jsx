/** Sales Bill "Avg buy" chip: the whole average purchase price is shown, never cut short ("Avg buy ₹1…"). */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductRowsEditor } from '@/components/bill';
import { db } from '@/core/db';
import { invalidateStocksCache } from '@/features/overview/stocks/stocksService';
import { Badge } from '@/ui';

const mockStock = () => {
  vi.spyOn(db, 'getAllPurchaseBills').mockResolvedValue([
    {
      invoiceNo: 'P-1',
      invoiceDate: '2026-10-01',
      products: [{ description: 'Cotton Grey', qty: 100, rate: 132.78, amount: 13278 }],
    },
  ]);
  vi.spyOn(db, 'getAllInvoices').mockResolvedValue([]);
  vi.spyOn(db, 'getAllOpeningStocks').mockResolvedValue([]);
  vi.spyOn(db, 'getAllProductMetadata').mockResolvedValue([]);
  vi.spyOn(db, 'getAllReturns').mockResolvedValue([]);
  vi.spyOn(db, 'getAllPurchaseReturns').mockResolvedValue([]);
  vi.spyOn(db, 'getAllDyeingBatches').mockResolvedValue([]);
  vi.spyOn(db, 'getAllCombingBatches').mockResolvedValue([]);
  vi.spyOn(db, 'getAllProcessingLots').mockResolvedValue([]);
};

beforeEach(() => invalidateStocksCache());
afterEach(() => {
  vi.restoreAllMocks();
  invalidateStocksCache();
});

describe('Avg buy chip', () => {
  it('shows the full average purchase price on the Sales Bill, in a column wide enough for it', async () => {
    mockStock();
    render(
      <ProductRowsEditor
        rows={[{ description: 'Cotton Grey', rolls: '', qty: '2', rate: '150' }]}
        onChange={() => {}}
        shortcuts={null}
        showAvgCost
      />,
    );
    const price = await screen.findByText('₹132.78');
    const chip = price.parentElement;
    expect(chip).toHaveTextContent('Avg buy₹132.78');
    // nothing inside the chip truncates it
    expect(chip.querySelector('.truncate')).toBeNull();
    expect(chip).not.toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('columnheader', { name: 'Rate' })).toHaveClass('w-36');
  });

  it('a badge can opt out of truncation (wraps instead)', () => {
    render(
      <>
        <Badge>Cut if long</Badge>
        <Badge truncate={false}>Always whole</Badge>
      </>,
    );
    expect(screen.getByText('Cut if long')).toHaveClass('truncate');
    expect(screen.getByText('Always whole')).not.toHaveClass('truncate');
    expect(screen.getByText('Always whole')).toHaveClass('flex-wrap');
  });
});
