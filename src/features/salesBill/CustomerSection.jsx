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
import { FileText, Wallet } from 'lucide-react';
import { PartyNotFoundHint, PartyPicker } from '@/components/bill';
import { formatCurrency } from '@/core/format';
import { StatCard, StatGrid } from '@/ui';

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
        <section
          aria-label="Customer Account Summary"
          className="space-y-2.5 rounded-xl bg-gold-50/60 p-3 ring-1 ring-gold-200"
        >
          <h3 className="flex items-center gap-2 text-[13px] font-bold text-gold-800">
            <Wallet className="size-4" aria-hidden />
            Customer Account Summary
          </h3>
          <StatGrid cols={2}>
            <StatCard
              icon={FileText}
              tone="brand"
              value={rupees(summary.totalPreviousBills)}
              label="Total Previous Bills"
            />
            <StatCard
              icon={Wallet}
              tone={summary.balanceCarriedForward > 0 ? 'danger' : 'success'}
              value={rupees(summary.balanceCarriedForward)}
              label="Balance Carried Forward"
            />
          </StatGrid>
        </section>
      ) : null}
    </div>
  );
}
