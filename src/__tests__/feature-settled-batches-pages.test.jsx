import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DyeingSettledPage from '@/features/dyeing/DyeingSettledPage';
import CombingSettledPage from '@/features/combing/CombingSettledPage';
import DyeingPage from '@/features/dyeing/DyeingPage';
import CombingPage from '@/features/combing/CombingPage';
import CombingDetailsPage from '@/features/combing/CombingDetailsPage';
import { db } from '@/core/db';
import * as dyeingService from '@/features/dyeing/dyeingService';
import * as combingService from '@/features/combing/combingService';
import { FeedbackProvider } from '@/ui/Feedback';

function renderWithProviders(ui) {
  return render(
    <MemoryRouter>
      <FeedbackProvider>{ui}</FeedbackProvider>
    </MemoryRouter>,
  );
}

describe('Settled Batches Pages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('DyeingSettledPage', () => {
    const mockBatches = [
      {
        batchId: 'DB-ONGOING-1',
        status: 'IN_PROCESS',
        processorName: 'Vasanth Dyers',
        input: { qty: 100 },
        totalDyeingCost: 2000,
        payments: [],
      },
      {
        batchId: 'DB-SETTLED-1',
        status: 'COMPLETED',
        batchDate: '2026-10-01',
        completionDate: '2026-10-05',
        processorName: 'Sri Balaji Dyeing',
        input: { qty: 200 },
        output: [{ productName: 'Navy Blue Fabric', qty: 190, unitCost: 150 }],
        actualWeightLossPercent: 5,
        totalDyeingCost: 4000,
        payments: [{ id: 'p1', amount: 4000 }],
      },
      {
        batchId: 'DB-SETTLED-2',
        status: 'COMPLETED',
        batchDate: '2026-10-02',
        completionDate: '2026-10-08',
        processorName: 'Murugan Dyers',
        input: { qty: 300 },
        output: [{ productName: 'Maroon Fabric', qty: 285, unitCost: 160 }],
        actualWeightLossPercent: 5,
        totalDyeingCost: 6000,
        payments: [{ id: 'p2', amount: 2000 }],
      },
    ];

    it('displays only settled batches and renders summary metrics and actions', async () => {
      vi.spyOn(dyeingService, 'loadDyeingData').mockResolvedValue({
        batches: mockBatches,
        dyers: [{ id: 'd1', name: 'Sri Balaji Dyeing' }],
      });

      renderWithProviders(<DyeingSettledPage />);

      await waitFor(() => {
        expect(screen.getByText('#DB-SETTLED-1')).toBeInTheDocument();
        expect(screen.getByText('#DB-SETTLED-2')).toBeInTheDocument();
      });

      // The ongoing batch DB-ONGOING-1 must NOT be shown on the settled page
      expect(screen.queryByText('#DB-ONGOING-1')).not.toBeInTheDocument();

      // Check finished output fabric is visible
      expect(screen.getByText(/Navy Blue Fabric/i)).toBeInTheDocument();
      expect(screen.getByText(/Maroon Fabric/i)).toBeInTheDocument();

      // Check payment and history buttons
      expect(screen.getAllByRole('button', { name: /\+ Pay/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /History/i }).length).toBeGreaterThan(0);
    });

    it('filters settled batches by payment status (Balance Due vs Paid)', async () => {
      vi.spyOn(dyeingService, 'loadDyeingData').mockResolvedValue({
        batches: mockBatches,
        dyers: [],
      });

      renderWithProviders(<DyeingSettledPage />);

      await waitFor(() => {
        expect(screen.getByText('#DB-SETTLED-1')).toBeInTheDocument();
        expect(screen.getByText('#DB-SETTLED-2')).toBeInTheDocument();
      });

      // Click on "Balance Due"
      const dueButton = screen.getByRole('button', { name: /Balance Due/i });
      fireEvent.click(dueButton);

      await waitFor(() => {
        // Only DB-SETTLED-2 has balance due (4000 unpaid)
        expect(screen.getByText('#DB-SETTLED-2')).toBeInTheDocument();
        expect(screen.queryByText('#DB-SETTLED-1')).not.toBeInTheDocument();
      });

      // Click on "Fully Paid"
      const paidButton = screen.getByRole('button', { name: /Fully Paid/i });
      fireEvent.click(paidButton);

      await waitFor(() => {
        // Only DB-SETTLED-1 is fully paid
        expect(screen.getByText('#DB-SETTLED-1')).toBeInTheDocument();
        expect(screen.queryByText('#DB-SETTLED-2')).not.toBeInTheDocument();
      });
    });
  });

  describe('CombingSettledPage', () => {
    const mockCombingBatches = [
      {
        batchId: 'CB-ONGOING-1',
        status: 'IN_PROCESS',
        processorName: 'Premier Combers',
        input: { qty: 150 },
        totalProcessingCost: 3000,
        payments: [],
      },
      {
        batchId: 'CB-SETTLED-1',
        status: 'COMPLETED',
        batchDate: '2026-10-03',
        completionDate: '2026-10-09',
        processorName: 'Coimbatore Combing Mills',
        input: { qty: 500 },
        output: [{ productName: 'Combed Grey Roll', qty: 475, unitCost: 180 }],
        actualWeightLossPercent: 5,
        totalProcessingCost: 10000,
        payments: [{ id: 'p1', amount: 10000 }],
      },
    ];

    it('displays only completed combing batches and separates from ongoing', async () => {
      vi.spyOn(combingService, 'loadCombingData').mockResolvedValue({
        batches: mockCombingBatches,
        processors: [{ id: 'p1', name: 'Coimbatore Combing Mills' }],
      });

      renderWithProviders(<CombingSettledPage />);

      await waitFor(() => {
        expect(screen.getByText('#CB-SETTLED-1')).toBeInTheDocument();
      });

      // Ongoing batch CB-ONGOING-1 should not appear on Settled page
      expect(screen.queryByText('#CB-ONGOING-1')).not.toBeInTheDocument();
      expect(screen.getByText(/Combed Grey Roll/i)).toBeInTheDocument();
    });
  });
  describe('Ongoing pages and directory (simplified headers)', () => {
    const ongoing = {
      batchId: 'DB-ONGOING-9',
      status: 'IN_PROCESS',
      processorName: 'Vasanth Dyers',
      input: { qty: 100 },
      totalDyeingCost: 2000,
      payments: [{ id: 'p1', amount: 500, mode: 'UPI' }],
    };
    const settled = { batchId: 'DB-SETTLED-9', status: 'COMPLETED', totalDyeingCost: 0, payments: [] };

    it('DyeingPage shows a plain page header and no Settled link card / In Process badge', async () => {
      vi.spyOn(dyeingService, 'loadDyeingData').mockResolvedValue({
        batches: [ongoing, settled],
        shortcuts: [],
        bankAccounts: [],
        stockMap: new Map(),
        purchaseBills: [],
        dyers: [],
      });

      renderWithProviders(<DyeingPage />);

      await waitFor(() => expect(screen.getByText('#DB-ONGOING-9')).toBeInTheDocument());
      expect(screen.getByRole('heading', { level: 1, name: 'Dyeing & Processing' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
      expect(screen.queryByText(/View Settled Page/i)).not.toBeInTheDocument();
      expect(screen.queryByText('In Process')).not.toBeInTheDocument();
      // StatCard subtext merged into the label (legacy UPI payment counts as paid)
      expect(screen.getByText(/Dyeing Charges · Paid ₹500/)).toBeInTheDocument();
    });

    it('CombingPage renders with the plain header', async () => {
      vi.spyOn(combingService, 'loadCombingData').mockResolvedValue({
        batches: [],
        shortcuts: [],
        stockMap: new Map(),
        processors: [],
        dyeingBatches: [],
        purchaseBills: [],
      });

      renderWithProviders(<CombingPage />);

      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 1, name: 'Combing & Processing' })).toBeInTheDocument(),
      );
      expect(screen.getByText('No ongoing combing batches')).toBeInTheDocument();
    });

    it('CombingDetailsPage is titled Combing Units (no "Combating" typo)', async () => {
      vi.spyOn(combingService, 'getAllProcessorsList').mockResolvedValue([
        { id: 'm1', processorName: 'Coimbatore Combing Mills', ownerName: 'Ravi', phone: '9876543210' },
      ]);
      vi.spyOn(db, 'getAllCombingBatches').mockResolvedValue([]);

      renderWithProviders(<CombingDetailsPage />);

      await waitFor(() => expect(screen.getByText('Coimbatore Combing Mills')).toBeInTheDocument());
      expect(screen.getByRole('heading', { level: 1, name: 'Combing Units' })).toBeInTheDocument();
      expect(screen.queryByText(/Combating/i)).not.toBeInTheDocument();
    });
  });
});
