import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db';
import { addDyeingBatchPayment, deleteDyeingBatchPayment } from '@/features/dyeing/dyeingService';
import { addCombingBatchPayment, deleteCombingBatchPayment } from '@/features/combing/combingService';
import { calcBatchPaymentStats } from '@/features/dyeing/dyeingLogic';
import { calcCombingBatchPaymentStats } from '@/features/combing/combingLogic';

describe('Dyeing and Combing Payment Services End-to-End', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Dyeing Batch Payment Service', () => {
    it('records a cash payment, syncs with account transactions, and updates batch payments', async () => {
      let savedBatch = null;
      let savedTransaction = null;

      const mockBatch = {
        batchId: 'B-001',
        processorName: 'Sri Murugan Dyeing',
        totalDyeingCost: 1500,
        payments: [],
      };

      vi.spyOn(db, 'getDyeingBatch').mockResolvedValue(mockBatch);
      vi.spyOn(db, 'saveDyeingBatch').mockImplementation(async (doc) => {
        savedBatch = doc;
        return doc.batchId;
      });
      vi.spyOn(db, 'saveAccountTransaction').mockImplementation(async (tx) => {
        savedTransaction = tx;
        return tx.id;
      });
      vi.spyOn(db, 'invalidate').mockImplementation(() => {});

      const result = await addDyeingBatchPayment('B-001', {
        date: '2026-10-14',
        amount: 500,
        mode: 'Cash',
        notes: 'Advance part payment',
      });

      expect(result.payment.amount).toBe(500);
      expect(result.payment.mode).toBe('Cash');
      expect(savedBatch.payments).toHaveLength(1);
      expect(savedBatch.payments[0].amount).toBe(500);

      // Verify account transaction was created for live cash drawer sync
      expect(savedTransaction).not.toBeNull();
      expect(savedTransaction.amount).toBe(500);
      expect(savedTransaction.fromAccount).toBe('cash');
      expect(savedTransaction.type).toBe('expense');
      expect(savedTransaction.category).toBe('Dyeing Payment');

      // Verify balance calculation reflects payment
      const stats = calcBatchPaymentStats(savedBatch);
      expect(stats.totalPaid).toBe(500);
      expect(stats.balanceDue).toBe(1000);
      expect(stats.isPartial).toBe(true);
    });

    it('records a bank transfer payment with bankAccountId', async () => {
      let savedTransaction = null;
      const mockBatch = {
        batchId: 'B-002',
        processorName: 'Sri Murugan Dyeing',
        totalDyeingCost: 1200,
        payments: [],
      };

      vi.spyOn(db, 'getDyeingBatch').mockResolvedValue(mockBatch);
      vi.spyOn(db, 'saveDyeingBatch').mockResolvedValue('B-002');
      vi.spyOn(db, 'saveAccountTransaction').mockImplementation(async (tx) => {
        savedTransaction = tx;
        return tx.id;
      });

      const result = await addDyeingBatchPayment('B-002', {
        date: '2026-10-14',
        amount: 1200,
        mode: 'Bank',
        bankAccountId: 'bank_sbi_01',
        bankAccountName: 'SBI Current',
        reference: 'UTR987654',
      });

      expect(result.payment.mode).toBe('Bank');
      expect(result.payment.bankAccountId).toBe('bank_sbi_01');
      expect(savedTransaction.fromAccount).toBe('bank_sbi_01');
      expect(savedTransaction.notes).toContain('UTR987654');
    });

    it('deletes a payment and removes the corresponding account transaction', async () => {
      let savedBatch = null;
      let deletedTxId = null;

      const mockBatch = {
        batchId: 'B-001',
        processorName: 'Sri Murugan Dyeing',
        totalDyeingCost: 1500,
        payments: [
          { id: 'dye_pay_1', date: '2026-10-14', amount: 500, mode: 'Cash' },
          { id: 'dye_pay_2', date: '2026-10-15', amount: 1000, mode: 'Bank' },
        ],
      };

      vi.spyOn(db, 'getDyeingBatch').mockResolvedValue(mockBatch);
      vi.spyOn(db, 'saveDyeingBatch').mockImplementation(async (doc) => {
        savedBatch = doc;
        return doc.batchId;
      });
      vi.spyOn(db, 'deleteAccountTransaction').mockImplementation(async (id) => {
        deletedTxId = id;
      });

      await deleteDyeingBatchPayment('B-001', 'dye_pay_1');

      expect(savedBatch.payments).toHaveLength(1);
      expect(savedBatch.payments[0].id).toBe('dye_pay_2');
      expect(deletedTxId).toBe('dye_pay_1');
    });
  });

  describe('Combing Batch Payment Service', () => {
    it('records a payment on a combing batch and recalculates remaining balance', async () => {
      let savedBatch = null;
      let savedTransaction = null;

      const mockBatch = {
        batchId: 'CB-101',
        processorName: 'Lakshmi Combing Mills',
        totalProcessingCost: 2000,
        payments: [],
      };

      vi.spyOn(db, 'getCombingBatch').mockResolvedValue(mockBatch);
      vi.spyOn(db, 'saveCombingBatch').mockImplementation(async (doc) => {
        savedBatch = doc;
        return doc.batchId;
      });
      vi.spyOn(db, 'saveAccountTransaction').mockImplementation(async (tx) => {
        savedTransaction = tx;
        return tx.id;
      });

      const result = await addCombingBatchPayment('CB-101', {
        date: '2026-10-14',
        amount: 800,
        mode: 'UPI',
        bankAccountId: 'bank_hdfc',
        reference: 'UPI/998822',
      });

      expect(result.payment.amount).toBe(800);
      expect(savedBatch.payments).toHaveLength(1);
      expect(savedTransaction.category).toBe('Combing Payment');
      expect(savedTransaction.fromAccount).toBe('bank_hdfc');

      const stats = calcCombingBatchPaymentStats(savedBatch);
      expect(stats.totalPaid).toBe(800);
      expect(stats.balanceDue).toBe(1200);
      expect(stats.isPartial).toBe(true);
    });

    it('deletes a combing payment and removes the account transaction', async () => {
      let savedBatch = null;
      let deletedTxId = null;

      const mockBatch = {
        batchId: 'CB-101',
        processorName: 'Lakshmi Combing Mills',
        totalProcessingCost: 2000,
        payments: [
          { id: 'cb_pay_1', date: '2026-10-14', amount: 800, mode: 'UPI' },
        ],
      };

      vi.spyOn(db, 'getCombingBatch').mockResolvedValue(mockBatch);
      vi.spyOn(db, 'saveCombingBatch').mockImplementation(async (doc) => {
        savedBatch = doc;
        return doc.batchId;
      });
      vi.spyOn(db, 'deleteAccountTransaction').mockImplementation(async (id) => {
        deletedTxId = id;
      });

      await deleteCombingBatchPayment('CB-101', 'cb_pay_1');

      expect(savedBatch.payments).toHaveLength(0);
      expect(deletedTxId).toBe('cb_pay_1');

      const stats = calcCombingBatchPaymentStats(savedBatch);
      expect(stats.totalPaid).toBe(0);
      expect(stats.balanceDue).toBe(2000);
      expect(stats.isUnpaid).toBe(true);
    });
  });
});
