import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DyeingNavTabs from '@/features/dyeing/DyeingNavTabs';
import CombingNavTabs from '@/features/combing/CombingNavTabs';
import DyeingSettledPage from '@/features/dyeing/DyeingSettledPage';
import CombingSettledPage from '@/features/combing/CombingSettledPage';
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

describe('Settled Batches Pages and Navigation Tabs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('DyeingNavTabs & CombingNavTabs', () => {
    it('renders DyeingNavTabs with badge counts and correct links', () => {
      renderWithProviders(
        <DyeingNavTabs
          counts={{
            ongoing: 3,
            settled: 7,
            dyers: 4,
          }}
        />,
      );

      expect(screen.getByText('Ongoing Batches')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      expect(screen.getByText('Settled Batches')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();

      expect(screen.getByText('Dyeing Details')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('renders CombingNavTabs with badge counts and correct links', () => {
      renderWithProviders(
        <CombingNavTabs
          counts={{
            ongoing: 2,
            settled: 5,
            processors: 3,
          }}
        />,
      );

      expect(screen.getByText('Ongoing Batches')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();

      expect(screen.getByText('Settled Batches')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();

      expect(screen.getByText('Combating Details')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
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
});
