/**
 * Display names of money accounts. Bank accounts are created with just a bank name now (stored as both `accountName`
 * and `bankName`); older ones may have a separate display name, account number, type and notes. Always go through
 * these helpers instead of building "accountName (bankName)" strings, which read "HDFC (HDFC)" for new accounts.
 */
export const CASH_LABEL = 'Cash in Hand';

/** The name shown for a bank account (falls back to the bank name, then a generic label). */
export function accountLabel(account) {
  const name = String(account?.accountName ?? '').trim();
  const bank = String(account?.bankName ?? '').trim();
  return name || bank || 'Bank Account';
}

/** Name plus the bank in brackets only when an older account has a different display name ('Current A/c (SBI)'). */
export function accountLabelWithBank(account) {
  const name = accountLabel(account);
  const bank = String(account?.bankName ?? '').trim();
  return bank && bank.toLowerCase() !== name.toLowerCase() ? `${name} (${bank})` : name;
}
