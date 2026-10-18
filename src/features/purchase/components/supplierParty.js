/** Supplier Details records → the shared party details components (`@/components/party`). Mapping only. */
import { formatRupees } from '@/core/format';
import { buildPartyStatTiles } from '@/components/party/partyStats';
import { PARTY_KINDS } from '@/components/party/kinds';

/** `supplierStats` (over ALL suppliers — the search does not change them) in the shape of the shared stat tiles. */
export function supplierTotals(stats) {
  return {
    parties: stats.totalSuppliers,
    invoices: stats.totalBills,
    amount: stats.totalAmount,
    paid: stats.totalPaid,
    discount: stats.totalDiscount,
    returns: stats.totalReturns ?? 0,
    balance: stats.totalBalance,
  };
}

/** Stat cards of Supplier Details — the same tiles, order, labels and colours as Customer Details. */
export function buildSupplierStatTiles(stats) {
  return buildPartyStatTiles(supplierTotals(stats), PARTY_KINDS.supplier);
}

/**
 * One aggregated supplier as a row of the shared party list (see PartyRow). Balance Due is the supplier's ledger
 * balance; below zero it is an advance / credit with the supplier.
 */
export function toSupplierRow(supplier) {
  return {
    key: supplier.key,
    name: supplier.name,
    phone: supplier.phone,
    address: supplier.address,
    invoiceCount: String(supplier.totalBills),
    invoiceNumbers: supplier.allInvoiceNumbers,
    openingBalance: formatRupees(supplier.openingBalance),
    amount: formatRupees(supplier.totalAmount),
    paid: formatRupees(supplier.totalPaid),
    discount: formatRupees(supplier.totalDiscount),
    returns: formatRupees(supplier.totalReturns),
    balance: formatRupees(supplier.balanceDue),
    balanceValue: supplier.balanceDue,
    hasReturns: supplier.totalReturns > 0,
    source: supplier,
  };
}
