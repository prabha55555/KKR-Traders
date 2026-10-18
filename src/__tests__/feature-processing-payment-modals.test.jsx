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
        <AddDyeingPaymentModal open={true} batch={mockBatch} onClose={vi.fn()} onPaymentAdded={vi.fn()} />,
      );

      // Verify header and balance
      expect(screen.getByText(/Pay Dyer — Batch B-101/i)).toBeInTheDocument();
      expect(screen.getByText(/₹3,000/)).toBeInTheDocument();

      // Only two methods: Cash and Account (UPI is an Account payment)
      expect(screen.queryByRole('button', { name: /UPI/i })).not.toBeInTheDocument();

      // Click on "Account" mode
      const accountModeButton = screen.getByRole('radio', { name: /^Account$/i });
      fireEvent.click(accountModeButton);

      // Verify the Select Bank Account dropdown appears and does NOT crash
      await waitFor(() => {
        expect(screen.getByLabelText(/Select Bank Account/i)).toBeInTheDocument();
      });
      // Option labels are just the account name; the balance is shown on its own line
      expect(screen.getByRole('option', { name: 'HDFC Business' })).toBeInTheDocument();
      expect(screen.getByText(/Available:/i)).toBeInTheDocument();
      expect(screen.getByText(/₹50,000/)).toBeInTheDocument();

      // Change selected bank account in dropdown
      const bankSelect = screen.getByLabelText(/Select Bank Account/i);
      fireEvent.change(bankSelect, { target: { value: 'acc_2' } });
      expect(screen.getByText(/₹12,000/)).toBeInTheDocument();

      // Click back on "Cash" mode
      const cashModeButton = screen.getByRole('radio', { name: /Cash/i });
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
        <AddCombingPaymentModal open={true} batch={mockBatch} onClose={vi.fn()} onPaymentAdded={vi.fn()} />,
      );

      // Verify header
      expect(screen.getByText(/Pay Mill \/ Processor — Batch CB-202/i)).toBeInTheDocument();

      // Switch to Account
      const accountModeButton = screen.getByRole('radio', { name: /^Account$/i });
      fireEvent.click(accountModeButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/Select Bank Account/i)).toBeInTheDocument();
      });

      // Change bank account
      const bankSelect = screen.getByLabelText(/Select Bank Account/i);
      fireEvent.change(bankSelect, { target: { value: 'acc_1' } });
      expect(bankSelect.value).toBe('acc_1');
    });
  });

  describe('Account payments keep the stored mode value', () => {
    it("records an Account payment as mode 'Bank' with the selected account", async () => {
      const mockBatch = {
        batchId: 'B-505',
        processorName: 'Sri Balaji Dyeing',
        totalDyeingCost: 4000,
        payments: [],
      };
      const spy = vi
        .spyOn(dyeingService, 'addDyeingBatchPayment')
        .mockResolvedValue({ batch: mockBatch, payment: {} });

      renderWithFeedback(
        <AddDyeingPaymentModal open={true} batch={mockBatch} onClose={vi.fn()} onPaymentAdded={vi.fn()} />,
      );

      fireEvent.click(screen.getByRole('radio', { name: /^Account$/i }));
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'SBI Current' })).toBeInTheDocument();
      });
      fireEvent.change(screen.getByLabelText(/Select Bank Account/i), { target: { value: 'acc_2' } });
      fireEvent.submit(document.getElementById('dyeing-payment-form'));

      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(spy).toHaveBeenCalledWith(
        'B-505',
        expect.objectContaining({
          amount: 4000,
          mode: 'Bank',
          bankAccountId: 'acc_2',
          bankAccountName: 'SBI Current',
        }),
      );
    });

    it('names an account that only has a bank name (new 2-field accounts)', async () => {
      accountsLogic.loadLiveAccountBalances.mockResolvedValue({
        cashBalance: 0,
        bankAccounts: [{ id: 'acc_9', bankName: 'Canara Bank', currentBalance: 700 }],
      });
      const mockBatch = { batchId: 'CB-9', processorName: 'Mill', totalProcessingCost: 100, payments: [] };
      const spy = vi
        .spyOn(combingService, 'addCombingBatchPayment')
        .mockResolvedValue({ batch: mockBatch, payment: {} });

      renderWithFeedback(
        <AddCombingPaymentModal open={true} batch={mockBatch} onClose={vi.fn()} onPaymentAdded={vi.fn()} />,
      );

      fireEvent.click(screen.getByRole('radio', { name: /^Account$/i }));
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Canara Bank' })).toBeInTheDocument();
      });
      expect(screen.getByText(/₹700/)).toBeInTheDocument();
      fireEvent.submit(document.getElementById('combing-payment-form'));

      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(spy.mock.calls[0][1]).toMatchObject({
        mode: 'Bank',
        bankAccountId: 'acc_9',
        bankAccountName: 'Canara Bank',
      });
    });
  });

  describe('Payment history mode badges', () => {
    it('shows legacy UPI and Bank payments as Account, and Cash as Cash in Hand', () => {
      const mockBatch = {
        batchId: 'B-606',
        processorName: 'Sri Balaji Dyeing',
        totalDyeingCost: 9000,
        payments: [
          { id: 'a', amount: 1000, mode: 'UPI', date: '2026-10-01', bankAccountName: 'HDFC Business' },
          { id: 'b', amount: 2000, mode: 'Bank', date: '2026-10-02', bankAccountName: 'SBI Current' },
          { id: 'c', amount: 3000, mode: 'Cash', date: '2026-10-03' },
        ],
      };

      renderWithFeedback(
        <DyeingPaymentHistoryModal
          open={true}
          batch={mockBatch}
          onClose={vi.fn()}
          onOpenAddPayment={vi.fn()}
        />,
      );

      expect(screen.getByText('Account: HDFC Business')).toBeInTheDocument();
      expect(screen.getByText('Account: SBI Current')).toBeInTheDocument();
      expect(screen.getByText('Cash in Hand')).toBeInTheDocument();
      expect(screen.queryByText(/UPI/)).not.toBeInTheDocument();
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
