import {
  ArrowLeft,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PieChart,
  Receipt,
  ShoppingCart,
  Sparkles,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { useAuth } from '@/app/AuthProvider';
import { COMPANY } from '@/core/branding';
import { formatDateShort, todayISO } from '@/core/format';
import { cn, useFeedback } from '@/ui';
import { BrandLockup, BrandMark } from './Brand';
import { OfflineBanner } from './pwa';

/**
 * Navigation categories configured in the natural supply-chain order:
 * 1. Dashboard
 * 2. Purchase (Inward Grey Rolls / Traded Colored Rolls)
 * 3. Dyeing & Processing (Convert Grey to Finished Dyed Rolls)
 * 4. Combing & Processing (Combing & Finishing)
 * 5. Sales (Sell Finished Rolls)
 * 6. Finance (Bank, Cash, and Ledger Tracking)
 * 7. Overview (Stocks, Profit/Revenue, Analytics, Expenses)
 */
export const NAV_CATEGORIES = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    to: '/',
    isDirect: true,
  },
  {
    id: 'purchase',
    title: 'Purchase',
    icon: ShoppingCart,
    basePath: '/purchase',
    home: '/purchase/bill',
    items: [
      { to: '/purchase/bill', label: 'Purchase Bill', short: 'Bill', icon: FilePlus2 },
      { to: '/purchase/history', label: 'Purchase History', short: 'History', icon: History },
      { to: '/purchase/add-supplier', label: 'Add Supplier', short: 'Add', icon: UserPlus },
      { to: '/purchase/suppliers', label: 'Supplier Details', short: 'Suppliers', icon: Users },
      { to: '/purchase/bin', label: 'Recycle Bin', short: 'Bin', icon: Trash2 },
    ],
  },
  {
    id: 'dyeing',
    title: 'Dyeing & Processing',
    icon: Layers,
    basePath: '/dyeing',
    home: '/dyeing/batches',
    items: [
      { to: '/dyeing/batches', label: 'Ongoing Batches', short: 'Ongoing', icon: Layers },
      { to: '/dyeing/settled', label: 'Settled Batches', short: 'Settled', icon: CheckCircle2 },
      { to: '/dyeing/details', label: 'Dyeing Details', short: 'Dyeing Details', icon: Users },
    ],
  },
  {
    id: 'combing',
    title: 'Combing & Processing',
    icon: Sparkles,
    basePath: '/combing',
    home: '/combing/batches',
    items: [
      { to: '/combing/batches', label: 'Ongoing Batches', short: 'Ongoing', icon: Layers },
      { to: '/combing/settled', label: 'Settled Batches', short: 'Settled', icon: CheckCircle2 },
      { to: '/combing/details', label: 'Combating Details', short: 'Combating Details', icon: Users },
    ],
  },
  {
    id: 'sales',
    title: 'Sales',
    icon: Receipt,
    basePath: '/sales',
    home: '/sales/bill',
    items: [
      { to: '/sales/bill', label: 'Sales Bill', short: 'Bill', icon: FilePlus2 },
      { to: '/sales/history', label: 'Sales History', short: 'History', icon: History },
      { to: '/sales/add-customer', label: 'Add Customer', short: 'Add', icon: UserPlus },
      { to: '/sales/customers', label: 'Customer Details', short: 'Customers', icon: Users },
      { to: '/sales/bin', label: 'Recycle Bin', short: 'Bin', icon: Trash2 },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    icon: Landmark,
    basePath: '/finance',
    home: '/finance/accounts',
    items: [
      { to: '/finance/accounts', label: 'Bank & Cash Balances', short: 'Accounts', icon: Landmark },
      { to: '/finance/records', label: 'Ongoing Records', short: 'Ongoing', icon: FilePlus2 },
      { to: '/finance/settled', label: 'Settled Records', short: 'Settled', icon: CheckCircle2 },
      { to: '/finance/lenders', label: 'Lender Details', short: 'Lenders', icon: Users },
    ],
  },
  {
    id: 'overview',
    title: 'Overview',
    icon: PieChart,
    basePath: '/overview',
    home: '/overview/revenue',
    items: [
      { to: '/overview/revenue', label: 'Revenue', short: 'Revenue', icon: TrendingUp },
      { to: '/overview/statistics', label: 'Statistics', short: 'Stats', icon: PieChart },
      { to: '/overview/stocks', label: 'Stocks', short: 'Stocks', icon: Boxes },
      { to: '/overview/expenses', label: 'Expenses', short: 'Expenses', icon: Wallet },
      { to: '/overview/shortcuts', label: 'Shortcuts', short: 'Shortcuts', icon: Zap },
    ],
  },
];

export const MODULES = {
  purchase: NAV_CATEGORIES[1],
  dyeing: NAV_CATEGORIES[2],
  combing: NAV_CATEGORIES[3],
  sales: NAV_CATEGORIES[4],
  finance: NAV_CATEGORIES[5],
  overview: NAV_CATEGORIES[6],
};

function useLogout() {
  const { logout } = useAuth();
  const { confirm } = useFeedback();
  return async () => {
    const ok = await confirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      tone: 'danger',
      confirmText: 'Logout',
    });
    if (ok) await logout();
  };
}

const initial = (name) => (name?.trim()?.[0] ?? 'U').toUpperCase();

function UserCard({ onLogout }) {
  const { username } = useAuth();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/10">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold-sheen font-display text-base font-extrabold text-brand-900">
        {initial(username)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-white">{username ?? 'User'}</div>
        <div className="text-[11px] text-brand-300">Signed in</div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Logout"
        title="Logout"
        className="rounded-xl p-2 text-brand-300 transition hover:bg-red-500/20 hover:text-red-200"
      >
        <LogOut className="size-[18px]" />
      </button>
    </div>
  );
}

/**
 * Accordion Navigation Menu:
 * Displays all 5 categories. Collapsible categories expand/collapse smoothly when clicked.
 * Automatically keeps the active module's category open by default while other categories stay collapsed.
 */
function NavAccordion({ onItemClick }) {
  const { pathname } = useLocation();

  const activeCategoryId = useMemo(() => {
    if (pathname === '/') return 'dashboard';
    return NAV_CATEGORIES.find((cat) => !cat.isDirect && pathname.startsWith(cat.basePath))?.id;
  }, [pathname]);

  const [openCategories, setOpenCategories] = useState(() => {
    if (activeCategoryId && activeCategoryId !== 'dashboard') {
      return { [activeCategoryId]: true };
    }
    return {};
  });

  useEffect(() => {
    if (activeCategoryId && activeCategoryId !== 'dashboard') {
      setOpenCategories((prev) => {
        if (!prev[activeCategoryId]) {
          return { ...prev, [activeCategoryId]: true };
        }
        return prev;
      });
    }
  }, [activeCategoryId]);

  const toggleCategory = (catId) => {
    setOpenCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  return (
    <nav className="flex-1 scrollbar-thin space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      <div className="mb-2 px-3.5 text-[11px] font-bold tracking-[0.18em] text-brand-400 uppercase">
        Navigation
      </div>

      {NAV_CATEGORIES.map((category) => {
        if (category.isDirect) {
          return (
            <NavLink
              key={category.id}
              to={category.to}
              end
              onClick={onItemClick}
              className={({ isActive: linkActive }) =>
                cn(
                  'group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition duration-150',
                  linkActive
                    ? 'bg-white/10 font-semibold text-white'
                    : 'text-brand-200 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive: linkActive }) => (
                <>
                  <span
                    className={cn(
                      'absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-gradient transition',
                      linkActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <category.icon
                    className={cn(
                      'size-[18px] transition',
                      linkActive ? 'text-gold-300' : 'text-brand-300 group-hover:text-gold-300',
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 text-left">{category.title}</span>
                </>
              )}
            </NavLink>
          );
        }

        const isOpen = !!openCategories[category.id];
        const isActiveCategory = activeCategoryId === category.id;
        const Icon = category.icon;

        return (
          <div key={category.id} className="space-y-0.5">
            <button
              type="button"
              onClick={() => toggleCategory(category.id)}
              aria-expanded={isOpen}
              className={cn(
                'group relative flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition duration-150',
                isActiveCategory
                  ? 'bg-white/10 font-semibold text-white'
                  : 'text-brand-200 hover:bg-white/5 hover:text-white',
              )}
            >
              <span
                className={cn(
                  'absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-gradient transition',
                  isActiveCategory ? 'opacity-100' : 'opacity-0',
                )}
              />
              <div className="flex min-w-0 items-center gap-3">
                <Icon
                  className={cn(
                    'size-[18px] shrink-0 transition',
                    isActiveCategory ? 'text-gold-300' : 'text-brand-300 group-hover:text-gold-300',
                  )}
                  aria-hidden
                />
                <span className="truncate">{category.title}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-brand-300 ring-1 ring-white/10">
                  {category.items.length}
                </span>
                <ChevronDown
                  className={cn(
                    'size-4 text-brand-400 transition-transform duration-200 ease-in-out group-hover:text-gold-300',
                    isOpen && 'rotate-180 text-gold-300',
                  )}
                  aria-hidden
                />
              </div>
            </button>

            {/* Smooth Collapsible Submenu */}
            <div
              className={cn(
                'grid transition-all duration-200 ease-in-out',
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <div className="my-1 ml-5 space-y-0.5 border-l border-white/10 py-0.5 pl-3">
                  {category.items.map(({ to, label, icon: SubIcon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={onItemClick}
                      className={({ isActive: itemActive }) =>
                        cn(
                          'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition duration-150',
                          itemActive
                            ? 'bg-gold-500/15 font-semibold text-gold-200 shadow-sm ring-1 ring-gold-400/20'
                            : 'text-brand-300 hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      {({ isActive: itemActive }) => (
                        <>
                          <SubIcon
                            className={cn(
                              'size-4 shrink-0 transition',
                              itemActive ? 'text-gold-400' : 'text-brand-400 group-hover:text-gold-300',
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{label}</span>
                          {itemActive && (
                            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Sidebar() {
  const onLogout = useLogout();
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-white/5 surface-ink lg:flex">
      <div className="px-5 pt-6 pb-5">
        <BrandLockup />
      </div>
      <div className="mx-5 h-px hairline-gold opacity-60" />

      <NavAccordion />

      <div className="space-y-3 border-t border-white/5 p-3">
        <UserCard onLogout={onLogout} />
        <p className="px-2 pb-1 text-center text-[10px] tracking-wide text-brand-400">
          Powered by {COMPANY.displayName}
        </p>
      </div>
    </aside>
  );
}

function TopBarCategoryDropdown({ category, isActiveCategory, currentPath }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleDown);
    return () => window.removeEventListener('pointerdown', handleDown);
  }, [open]);

  const Icon = category.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition',
          isActiveCategory
            ? 'bg-brand-900 text-white shadow-sm ring-1 ring-white/10'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        <Icon className={cn('size-3.5', isActiveCategory ? 'text-gold-400' : 'text-slate-500')} />
        <span>{category.title}</span>
        <ChevronDown
          className={cn(
            'size-3 text-slate-400 transition-transform duration-150',
            open && 'rotate-180 text-slate-700',
          )}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-56 animate-fade-in rounded-2xl border border-line bg-white/95 p-1.5 shadow-pop backdrop-blur-md">
          <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            {category.title}
          </div>
          <div className="space-y-0.5">
            {category.items.map(({ to, label, icon: SubIcon }) => {
              const isItemActive = currentPath.startsWith(to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium transition',
                    isItemActive
                      ? 'bg-gold-50 font-bold text-brand-950 ring-1 ring-gold-200/80'
                      : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900',
                  )}
                >
                  <SubIcon className={cn('size-3.5', isItemActive ? 'text-gold-600' : 'text-slate-400')} />
                  <span className="truncate">{label}</span>
                  {isItemActive && <span className="ml-auto size-1.5 rounded-full bg-gold-500" />}
                </NavLink>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Desktop top bar: breadcrumb, quick category dropdowns, today's date. */
function TopBar({ module }) {
  const { pathname } = useLocation();
  const page = module?.items?.find((i) => pathname.startsWith(i.to));
  const label = page?.label ?? (pathname.includes('/edit/') ? 'Edit Purchase Bill' : module?.title);

  return (
    <div className="no-print sticky top-0 z-20 hidden h-14 items-center justify-between border-b border-line glass px-6 lg:flex">
      <nav className="flex shrink-0 items-center gap-2 text-sm" aria-label="Breadcrumb">
        <module.icon className="size-4 text-gold-600" aria-hidden />
        <span className="font-medium text-slate-500">{module.title}</span>
        <ChevronRight className="size-3.5 text-slate-300" aria-hidden />
        <span className="font-semibold text-brand-800">{label}</span>
      </nav>

      {/* Quick Category Dropdown navigation */}
      <div className="hidden items-center gap-1 xl:flex" aria-label="Quick Category Navigation">
        {NAV_CATEGORIES.map((category) => {
          if (category.isDirect) {
            const isActive = pathname === '/';
            return (
              <NavLink
                key={category.id}
                to={category.to}
                end
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition',
                  isActive
                    ? 'bg-brand-900 text-white shadow-sm ring-1 ring-white/10'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <category.icon className={cn('size-3.5', isActive ? 'text-gold-400' : 'text-slate-500')} />
                <span>{category.title}</span>
              </NavLink>
            );
          }

          const isActiveCategory = pathname.startsWith(category.basePath);
          return (
            <TopBarCategoryDropdown
              key={category.id}
              category={category}
              isActiveCategory={isActiveCategory}
              currentPath={pathname}
            />
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
        <CalendarDays className="size-3.5 text-gold-600" aria-hidden />
        {formatDateShort(todayISO())}
      </div>
    </div>
  );
}

function MobileDrawer({ open, onClose }) {
  const onLogout = useLogout();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="fixed inset-0 bg-brand-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex h-full w-80 max-w-[85vw] animate-sheet-in flex-col surface-ink text-white shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <BrandLockup />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-xl p-2 text-brand-300 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <NavAccordion onItemClick={onClose} />
        </div>

        <div className="border-t border-white/10 p-3">
          <UserCard onLogout={onLogout} />
        </div>
      </div>
    </div>
  );
}

function MobileHeader({ module, onOpenMenu }) {
  const navigate = useNavigate();
  const onLogout = useLogout();
  return (
    <header className="no-print pt-safe h-app-header fixed inset-x-0 top-0 z-40 flex items-center gap-2 surface-ink px-3 text-white shadow-lift lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation menu"
        className="rounded-xl p-2 text-brand-200 transition hover:bg-white/10 active:scale-95"
      >
        <Menu className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => navigate('/')}
        aria-label="Back to dashboard"
        className="rounded-xl p-2 text-brand-200 transition hover:bg-white/10 active:scale-95"
      >
        <ArrowLeft className="size-4.5" />
      </button>
      <BrandMark size="sm" />
      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate font-display text-[15px] font-bold">{module.title}</h1>
        <p className="text-[10px] tracking-[0.2em] text-gold-400 uppercase">Brightlight Billing</p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Logout"
        className="rounded-xl p-2 text-brand-200 hover:bg-white/10"
      >
        <LogOut className="size-5" />
      </button>
    </header>
  );
}

function BottomTabs({ module }) {
  return (
    <nav
      className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/10 surface-ink shadow-[0_-10px_30px_-12px_rgb(12_16_34/0.55)] lg:hidden"
      aria-label={`${module.title} navigation`}
    >
      <ul className="mx-auto flex max-w-2xl px-1">
        {module.items.map(({ to, short, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[3.6rem] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold transition',
                  isActive ? 'text-gold-300' : 'text-brand-300',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'rounded-full px-3 py-1 transition sm:px-4',
                      isActive && 'bg-gold-sheen text-brand-900 shadow-gold',
                    )}
                  >
                    <Icon className="size-4.5 sm:size-5" aria-hidden />
                  </span>
                  <span className="max-w-[75px] truncate text-center leading-tight sm:max-w-none">
                    {short}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Shell of the Sales / Purchase / Overview / Finance modules: sidebar on desktop, header + bottom tabs on phones & tablets. */
export function ModuleLayout({ module: key }) {
  const module = MODULES[key];
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <MobileDrawer open={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* the phone header is fixed: this spacer keeps the content below it */}
        <div className="h-app-header lg:hidden" aria-hidden />
        <MobileHeader module={module} onOpenMenu={() => setMobileDrawerOpen(true)} />
        <OfflineBanner />
        <TopBar module={module} />
        <main className="flex-1 pb-40 lg:pb-10">
          <Outlet />
        </main>
        <BottomTabs module={module} />
      </div>
    </div>
  );
}
