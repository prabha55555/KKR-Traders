import { formatAmountToText, formatRupees } from '@/core/format';
import { balanceStatusTone, formatCount } from './display';

/** "(1.15 Cr)" under a money tile — nothing below ₹1,000. */
function inWords(amount) {
  const text = formatAmountToText(amount);
  return text ? `(${text})` : undefined;
}

/**
 * The status tiles of a party details page — one order, one set of labels and colours for customers and suppliers:
 * Total <Parties>, Total Invoices, Total Amount, Total Paid, Total Discount, [Total Returns — only when there are
 * returns, shown as a deduction], Total Balance. Money tiles that can grow large (amount, paid, returns, balance)
 * carry the amount in words as their hint.
 * Tones are the app's status colours: counts info, billed amount brand, paid success, discount neutral, returns
 * warning, balance danger while owed / success in credit / neutral when nil.
 *
 * totals = { parties, invoices, amount, paid, discount, returns, balance } (plain numbers, already summed by the page)
 * kind   = PARTY_KINDS.customer | PARTY_KINDS.supplier
 * returns [{ key, label, value, hint?, tone }]
 */
export function buildPartyStatTiles(totals, kind) {
  const tiles = [
    { key: 'parties', label: `Total ${kind.plural}`, value: formatCount(totals.parties), tone: 'info' },
    { key: 'invoices', label: 'Total Invoices', value: formatCount(totals.invoices), tone: 'info' },
    {
      key: 'amount',
      label: 'Total Amount',
      value: formatRupees(totals.amount),
      hint: inWords(totals.amount),
      tone: 'brand',
    },
    {
      key: 'paid',
      label: 'Total Paid',
      value: formatRupees(totals.paid),
      hint: inWords(totals.paid),
      tone: 'success',
    },
    { key: 'discount', label: 'Total Discount', value: formatRupees(totals.discount), tone: 'neutral' },
  ];
  if (totals.returns > 0) {
    tiles.push({
      key: 'returns',
      label: 'Total Returns',
      value: `-${formatRupees(totals.returns)}`,
      hint: inWords(totals.returns),
      tone: 'warning',
    });
  }
  tiles.push({
    key: 'balance',
    label: 'Total Balance',
    value: formatRupees(totals.balance),
    hint: inWords(totals.balance),
    tone: balanceStatusTone(totals.balance),
  });
  return tiles;
}
