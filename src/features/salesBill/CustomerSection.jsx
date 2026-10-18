/**
 * "Bill to Party": the phone drives the lookup, name/address are read-only (customers are created on Add Customer).
 * When a full phone number matches nobody, a hint links to Add Customer with `?phone=`. Below it, the
 * "Customer Account Summary" (total of previous bills + balance carried forward) when the customer has history.
 *
 * Props
 *  - customers: Array<{phone, name, address}>
 *  - phone, name, address: string
 *  - notFoundPhone: string | null        from useCustomerLookup().notFoundPhone
 *  - onPhoneChange(phone) · onSelect(party)
 *  - summary: { totalPreviousBills, balanceCarriedForward } | null
 */
import { Wallet } from 'lucide-react';
import { PartyNotFoundHint, PartyPicker } from '@/components/bill';
import { formatCurrency } from '@/core/format';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function CustomerSection({
  customers,
  phone,
  name,
  address,
  notFoundPhone,
  onPhoneChange,
  onSelect,
  summary,
}) {
  const showHint = notFoundPhone !== null && notFoundPhone === phone.trim();
  return (
    <div className="space-y-3">
      <PartyPicker
        partyLabel="Customer"
        parties={customers}
        phone={phone}
        name={name}
        address={address}
        onPhoneChange={onPhoneChange}
        onSelect={onSelect}
        notFound={
          showHint ? (
            <PartyNotFoundHint
              partyLabel="Customer"
              to={`/sales/add-customer?phone=${encodeURIComponent(notFoundPhone)}`}
            />
          ) : null
        }
      />
      {summary ? (
        <div
          className="grid gap-px overflow-hidden rounded-xl border border-gold-200 bg-gold-200/60 sm:grid-cols-2"
          aria-label="Customer Account Summary"
        >
          <div className="col-span-full bg-gold-50 px-3.5 py-2">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-gold-800">
              <Wallet className="size-4" aria-hidden />
              Customer Account Summary
            </h3>
          </div>
          <div className="bg-white px-3.5 py-3">
            <div className="text-xs font-medium text-slate-500">Total Previous Bills:</div>
            <div className="mt-0.5 font-display text-lg font-extrabold text-brand-800 tabular-nums">
              {rupees(summary.totalPreviousBills)}
            </div>
          </div>
          <div className="bg-white px-3.5 py-3">
            <div className="text-xs font-medium text-slate-500">Balance Carried Forward:</div>
            <div className="mt-0.5 font-display text-lg font-extrabold text-red-600 tabular-nums">
              {rupees(summary.balanceCarriedForward)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
