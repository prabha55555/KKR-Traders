import { buildPartyStatTiles } from '@/components/party/partyStats';
import { PARTY_KINDS } from '@/components/party/kinds';

/** Customer Details totals (`computeStats`) in the shape the shared party stat tiles take. */
export function customerTotals(stats) {
  return {
    parties: stats.totalCustomers,
    invoices: stats.totalInvoices,
    amount: stats.totalCurrentBillAmount,
    paid: stats.totalPaid,
    discount: stats.totalDiscountAmount,
    returns: stats.totalReturns,
    balance: stats.pendingBalance,
  };
}

/**
 * Stat cards in the web's order: Customers, Invoices, Amount, Paid, Discount, [Returns], Balance — the same tiles,
 * labels and colours as Supplier Details (see buildPartyStatTiles).
 * PARITY NOTE: the web tried to colour the "Total Balance" card by sign, but compared the card's id (which it does not
 * have — the id sits on the heading), so the card was always green. Colour by sign as the code intended.
 */
export function buildStatTiles(stats) {
  return buildPartyStatTiles(customerTotals(stats), PARTY_KINDS.customer);
}
