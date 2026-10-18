import { CheckCircle2, Layers, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { db } from '@/core/db';
import { DYEING_STATUS } from './dyeingLogic';

/**
 * Responsive scrollable tabs across all Dyeing pages:
 * Ongoing Batches | Settled Batches | Dyeing Details
 */
export default function DyeingNavTabs({ counts: customCounts }) {
  const [counts, setCounts] = useState(customCounts || {});

  useEffect(() => {
    if (
      customCounts?.ongoing !== undefined &&
      customCounts?.settled !== undefined &&
      customCounts?.dyers !== undefined
    ) {
      setCounts(customCounts);
      return;
    }

    let mounted = true;
    Promise.all([
      db.getAllDyeingBatches ? db.getAllDyeingBatches().catch(() => []) : Promise.resolve([]),
      db.getAllDyers ? db.getAllDyers().catch(() => []) : Promise.resolve([]),
    ])
      .then(([batches, dyers]) => {
        if (!mounted) return;
        const ongoing = batches.filter((b) => b.status !== DYEING_STATUS.COMPLETED).length;
        const settled = batches.filter((b) => b.status === DYEING_STATUS.COMPLETED).length;
        setCounts({
          ongoing: customCounts?.ongoing ?? ongoing,
          settled: customCounts?.settled ?? settled,
          dyers: customCounts?.dyers ?? dyers.length,
        });
      })
      .catch(console.error);

    return () => {
      mounted = false;
    };
  }, [customCounts]);

  const tabs = [
    {
      to: '/dyeing/batches',
      label: 'Ongoing Batches',
      icon: Layers,
      badge: counts.ongoing !== undefined ? counts.ongoing : null,
      activeClass: 'bg-gradient-to-r from-slate-900 to-brand-950 text-white shadow-sm',
      iconActive: 'text-amber-300',
    },
    {
      to: '/dyeing/settled',
      label: 'Settled Batches',
      icon: CheckCircle2,
      badge: counts.settled !== undefined ? counts.settled : null,
      activeClass: 'bg-gradient-to-r from-emerald-900 to-teal-950 text-white shadow-sm',
      iconActive: 'text-emerald-300',
    },
    {
      to: '/dyeing/details',
      label: 'Dyeing Details',
      icon: Users,
      badge: counts.dyers !== undefined ? counts.dyers : null,
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
          end={to === '/dyeing/batches'}
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
