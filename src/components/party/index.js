/**
 * Shared building blocks of the party details pages (Sales → Customer Details, Purchase → Supplier Details), so both
 * pages keep one layout, one set of status cards, one toolbar, one table and one card design. Props are documented in
 * each file.
 *
 * PartyRow — one customer / supplier as the shared list shows it (each page maps its own records with `toRow`):
 *  key            unique React key
 *  name, phone, address
 *  invoiceCount   string · invoiceNumbers string[] (the invoice list opened from the count)
 *  openingBalance, amount, paid, discount, returns, balance   formatted money (₹1,234.00)
 *  balanceValue   number — its sign picks the balance colour (owed red / credit green / nil grey)
 *  hasReturns     boolean — amber returns marker and returns colour
 *  source         the page's own record (for row actions such as the customer reminder)
 */
export {
  balanceStatusTone,
  formatCount,
  isAddressTruncated,
  isPhoneMasked,
  maskPhone,
  PHONE_REVEAL_MS,
  previewAddress,
  revealPhone,
} from './display';
export { PARTY_KINDS } from './kinds';
export { buildPartyStatTiles } from './partyStats';
export { PartyCard } from './PartyCard';
export {
  amountClass,
  PARTY_AMOUNT_COLUMNS,
  PartyAddress,
  PartyBalanceBadge,
  PartyName,
  PartyPhone,
} from './PartyCells';
export { PartyDetailsPage, PartyExportButton } from './PartyDetailsPage';
export { PartyList } from './PartyList';
export { PartySearchToolbar } from './PartySearchToolbar';
export { PartyStatsGrid } from './PartyStatsGrid';
export { PartyTable, partyTableColumns } from './PartyTable';
