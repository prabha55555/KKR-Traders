import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as accountsLogic from '@/features/finance/accountsLogic';
import * as dyeingService from '@/features/dyeing/dyeingService';
import * as combingService from '@/features/combing/combingService';
import { AddDyeingPaymentModal } from '@/features/dyeing/AddDyeingPaymentModal';
import { DyeingPaymentHistoryModal } from '@/features/dyeing/DyeingPaymentHistoryModal';
import { AddCombingPaymentModal } from '@/features/combing/AddCombingPaymentModal';
import { CombingPaymentHistoryModal } from '@/features/combing/CombingPaymentHistoryModal';
import { FeedbackProvider } from '@/ui/Feedback';

const mockLiveBalances = {
  cashBalance: 25000,
  bankAccounts: [
    { id: 'acc_1', accountName: 'HDFC Business', bankName: 'HDFC Bank', currentBalance: 50000 },
    { id: 'acc_2', accountName: 'SBI Current', bankName: 'State Bank of India', currentBalance: 12000 },
  ],
};

function renderWithFeedback(ui) {
  return render(<FeedbackProvider>{ui}</FeedbackProvider>);
}

describe('Payment Modals Component Tests (Dyeing & Combing)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(accountsLogic, 'loadLiveAccountBalances').mockResolvedValue(mockLiveBalances);
  });

  describe('AddDyeingPaymentModal', () => {
    const mockBatch = {
      batchId: 'B-101',
      processorName: 'Sri Balaji Dyeing',
      totalDyeingCost: 5000,
      payments: [{ id: 'p1', amount: 2000, mode: 'Cash', date: '2026-10-10' }],
    };

    it('renders with prefilled balance due and allows switching payment modes without errors', async () => {
      renderWithFeedback(
        <AddDyeingPaymentModal
          open={true}
          batch={mockBatch}
          onClose={vi.fn()}
          onPaymentAdded={vi.fn()}
        />,
      );

      // Verify header and balance
      expect(screen.getByText(/Pay Dyer — Batch #B-101/i)).toBeInTheDocument();
      expect(screen.getByText(/₹3,000/)).toBeInTheDocument();

      // Click on "Bank" mode
      const bankModeButton = screen.getByRole('button', { name: /Bank/i });
      fireEvent.click(bankModeButton);

      // Verify the Select Bank Account dropdown appears and does NOT crash
      await waitFor(() => {
        expect(screen.getByLabelText(/Select Bank Account/i)).toBeInTheDocument();
      });

      // Change selected bank account in dropdown
      const bankSelect = screen.getByLabelText(/Select Bank Account/i);
      fireEvent.change(bankSelect, { target: { value: 'acc_2' } });

      // Click on "UPI" mode
      const upiModeButton = screen.getByRole('button', { name: /UPI/i });
      fireEvent.click(upiModeButton);
      expect(screen.getByLabelText(/Select Bank Account/i)).toBeInTheDocument();

      // Click back on "Cash" mode
      const cashModeButton = screen.getByRole('button', { name: /Cash/i });
      fireEvent.click(cashModeButton);
      expect(screen.queryByLabelText(/Select Bank Account/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Physical Cash Drawer:/i)).toBeInTheDocument();
    });
  });

  describe('AddCombingPaymentModal', () => {
    const mockBatch = {
      batchId: 'CB-202',
      processorName: 'Lakshmi Combing Mills',
      totalProcessingCost: 7500,
      payments: [],
    };

    it('renders with prefilled full charge and allows switching to Bank mode and selecting account', async () => {
      renderWithFeedback(
        <AddCombingPaymentModal
          open={true}
          batch={mockBatch}
          onClose={vi.fn()}
          onPaymentAdded={vi.fn()}
        />,
      );

      // Verify header
      expect(screen.getByText(/Pay Mill \/ Processor — Batch #CB-202/i)).toBeInTheDocument();

      // Switch to Bank
      const bankModeButton = screen.getByRole('button', { name: /Bank/i });
      fireEvent.click(bankModeButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/Select Bank Account/i)).toBeInTheDocument();
      });

      // Change bank account
      const bankSelect = screen.getByLabelText(/Select Bank Account/i);
      fireEvent.change(bankSelect, { target: { value: 'acc_1' } });
      expect(bankSelect.value).toBe('acc_1');
    });
  });

  describe('DyeingPaymentHistoryModal Delete Flow', () => {
    it('deletes a payment from history, updates view immediately and calls onPaymentDeleted', async () => {
      const mockBatch = {
        batchId: 'B-303',
        processorName: 'Sri Balaji Dyeing',
        totalDyeingCost: 6000,
        payments: [
          { id: 'pay_d1', amount: 2500, mode: 'Cash', date: '2026-10-12', notes: 'First instalment' },
        ],
      };

      const updatedBatch = {
        ...mockBatch,
        payments: [],
      };

      vi.spyOn(dyeingService, 'deleteDyeingBatchPayment').mockResolvedValue(updatedBatch);
      const onPaymentDeleted = vi.fn();

      renderWithFeedback(
        <DyeingPaymentHistoryModal
          open={true}
          batch={mockBatch}
          onClose={vi.fn()}
          onPaymentDeleted={onPaymentDeleted}
          onOpenAddPayment={vi.fn()}
        />,
      );

      // Verify payment is listed
      expect(screen.getAllByText(/₹2,500/)[0]).toBeInTheDocument();
      expect(screen.getByText(/"First instalment"/)).toBeInTheDocument();

      // Click Delete button
      const deleteButton = screen.getByRole('button', { name: /Delete/i });
      fireEvent.click(deleteButton);

      // Confirm dialog should appear
      await waitFor(() => {
        expect(screen.getByText(/Delete Payment of ₹2,500/i)).toBeInTheDocument();
      });

      // Click confirm "Delete Payment" button
      const confirmButton = screen.getByRole('button', { name: /^Delete Payment$/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(dyeingService.deleteDyeingBatchPayment).toHaveBeenCalledWith('B-303', 'pay_d1');
        expect(onPaymentDeleted).toHaveBeenCalledWith(updatedBatch);
      });

      // View should update to empty state
      await waitFor(() => {
        expect(screen.getByText(/No payments recorded yet/i)).toBeInTheDocument();
      });
    });
  });

  describe('CombingPaymentHistoryModal Delete Flow', () => {
    it('deletes a payment from combing history, updates view and calls onPaymentDeleted', async () => {
      const mockBatch = {
        batchId: 'CB-404',
        processorName: 'Lakshmi Combing Mills',
        totalProcessingCost: 8000,
        payments: [
          { id: 'pay_cb1', amount: 3000, mode: 'Bank', date: '2026-10-13', bankAccountName: 'HDFC' },
        ],
      };

      const updatedBatch = {
        ...mockBatch,
        payments: [],
      };

      vi.spyOn(combingService, 'deleteCombingBatchPayment').mockResolvedValue(updatedBatch);
      const onPaymentDeleted = vi.fn();

      renderWithFeedback(
        <CombingPaymentHistoryModal
          open={true}
          batch={mockBatch}
          onClose={vi.fn()}
          onPaymentDeleted={onPaymentDeleted}
          onOpenAddPayment={vi.fn()}
        />,
      );

      expect(screen.getAllByText(/₹3,000/)[0]).toBeInTheDocument();

      // Click Delete button
      const deleteBtn = screen.getByRole('button', { name: /Delete/i });
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(screen.getByText(/Delete Payment of ₹3,000/i)).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole('button', { name: /^Delete Payment$/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(combingService.deleteCombingBatchPayment).toHaveBeenCalledWith('CB-404', 'pay_cb1');
        expect(onPaymentDeleted).toHaveBeenCalledWith(updatedBatch);
      });

      await waitFor(() => {
        expect(screen.getByText(/No payments recorded yet/i)).toBeInTheDocument();
      });
    });
  });
});
