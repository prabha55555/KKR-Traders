import { billAmount, roundMoney } from '@/core/ledger';
import { toNum } from '@/core/format';

/**
 * What a bill itself sold / bought: subtotal - discount (same legacy fallbacks as the ledger's billAmount), WITHOUT the
 * bill's manual "Opening Balance" — that is a carried debt, not a sale or purchase, so it must not count in Total
 * Sales / Purchases, Net Profit or the Statistics figures.
 */
export const billOwnAmount = (bill, kind) =>
  roundMoney(billAmount(bill, kind) - toNum(bill?.manualPreviousBalance));
