import { formatAmountToText, formatRupees } from '@/core/format';
import { balanceTone, formatCount } from './display';
const subtitleOf = (amount) => {
  const text = formatAmountToText(amount);
  return text ? `(${text})` : undefined;
};
/**
 * Stat cards in the web's order: Customers, Invoices, Amount, Paid, Discount, [Returns], Balance.
 * PARITY NOTE: the web tried to colour the "Total Balance" card by sign, but compared the card's id (which it does not
 * have — the id sits on the heading), so the card was always green. Colour by sign as the code intended.
 */
export function buildStatTiles(stats) {
  const tiles = [
    {
      key: 'customers',
      icon: 'people',
      label: 'Total Customers',
      value: formatCount(stats.totalCustomers),
      tone: 'positive',
    },
    {
      key: 'invoices',
      icon: 'document-text',
      label: 'Total Invoices',
      value: formatCount(stats.totalInvoices),
      tone: 'positive',
    },
    {
      key: 'amount',
      icon: 'cash',
      label: 'Total Amount',
      value: formatRupees(stats.totalCurrentBillAmount),
      subtitle: subtitleOf(stats.totalCurrentBillAmount),
      tone: 'positive',
    },
    {
      key: 'paid',
      icon: 'checkmark-circle',
      label: 'Total Paid',
      value: formatRupees(stats.totalPaid),
      subtitle: subtitleOf(stats.totalPaid),
      tone: 'positive',
    },
    {
      key: 'discount',
      icon: 'pricetag',
      label: 'Total Discount',
      value: formatRupees(stats.totalDiscountAmount),
      tone: 'positive',
    },
  ];
  // the web injected this card only when there are returns, just before the balance card
  if (stats.totalReturns > 0) {
    tiles.push({
      key: 'returns',
      icon: 'arrow-undo',
      label: 'Total Returns',
      value: `-${formatRupees(stats.totalReturns)}`,
      subtitle: subtitleOf(stats.totalReturns),
      tone: 'negative',
    });
  }
  tiles.push({
    key: 'balance',
    icon: 'time',
    label: 'Total Balance',
    value: formatRupees(stats.pendingBalance),
    subtitle: subtitleOf(stats.pendingBalance),
    tone: balanceTone(stats.pendingBalance),
  });
  return tiles;
}
