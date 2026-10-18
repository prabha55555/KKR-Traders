import { Landmark, CheckCircle2, Building2, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { NavLink } from 'react-router';
import { db } from '@/core/db';
import { calculateFinanceStats } from './financeLogic';

/**
 * Responsive scrollable tabs across all Finance pages:
 * Ongoing Records | Settled Records | Lender Details | Bank & Cash Balances
 * Auto-fetches live counts when not explicitly passed, ensuring badges always stay accurate.
 */
export default function FinanceNavTabs({ counts: customCounts }) {
  const [counts, setCounts] = useState(customCounts || {});

  useEffect(() => {
    // If counts are already fully passed, don't re-fetch
    if (
      customCounts?.ongoing !== undefined &&
      customCounts?.settled !== undefined &&
      customCounts?.lenders !== undefined &&
      customCounts?.accounts !== undefined
    ) {
      setCounts(customCounts);
      return;
    }

    let mounted = true;
    Promise.all([
      db.getAllFinanceRecords().catch(() => []),
      db.getAllLenders().catch(() => []),
      db.getAllBankAccounts().catch(() => []),
    ])
      .then(([records, lenders, banks]) => {
        if (!mounted) return;
        const ongoing = records.filter((r) => !calculateFinanceStats(r).isSettled).length;
        const settled = records.filter((r) => calculateFinanceStats(r).isSettled).length;
        setCounts({
          ongoing: customCounts?.ongoing ?? ongoing,
          settled: customCounts?.settled ?? settled,
          lenders: customCounts?.lenders ?? lenders.length,
          accounts: customCounts?.accounts ?? banks.length + 1, // banks + cash in hand
        });
      })
      .catch(console.error);

    return () => {
      mounted = false;
    };
  }, [customCounts]);

  const tabs = [
    {
      to: '/finance/accounts',
      label: 'Bank & Cash Balances',
      icon: Building2,
      badge: counts.accounts !== undefined ? counts.accounts : null,
      activeClass: 'bg-gradient-to-r from-blue-900 to-indigo-950 text-white shadow-sm',
      iconActive: 'text-sky-300',
    },
    {
      to: '/finance/records',
      label: 'Ongoing Records',
      icon: Landmark,
      badge: counts.ongoing !== undefined ? counts.ongoing : null,
      activeClass: 'bg-gradient-to-r from-slate-900 to-brand-950 text-white shadow-sm',
      iconActive: 'text-amber-300',
    },
    {
      to: '/finance/settled',
      label: 'Settled Records',
      icon: CheckCircle2,
      badge: counts.settled !== undefined ? counts.settled : null,
      activeClass: 'bg-gradient-to-r from-emerald-900 to-teal-950 text-white shadow-sm',
      iconActive: 'text-emerald-300',
    },
    {
      to: '/finance/lenders',
      label: 'Lender Details',
      icon: Users,
      badge: counts.lenders !== undefined ? counts.lenders : null,
      activeClass: 'bg-gradient-to-r from-purple-900 to-indigo-950 text-white shadow-sm',
      iconActive: 'text-purple-300',
    },
  ];

  return (
    <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-1.5 overflow-x-auto border-b border-line px-4 pb-2.5 sm:mx-0 sm:px-0">
      {tabs.map(({ to, label, icon: Icon, badge, activeClass, iconActive }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition sm:text-sm ${
              isActive ? activeClass : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`size-3.5 sm:size-4 ${isActive ? iconActive : 'text-slate-400'}`} />
              <span>{label}</span>
              {badge !== null && (
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {badge}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
