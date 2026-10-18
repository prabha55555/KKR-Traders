import {
  Archive,
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
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

import { useAuth } from '@/app/AuthProvider';
import { COMPANY } from '@/core/branding';
import { formatDateShort, todayISO } from '@/core/format';
import { storage } from '@/platform';
import { cn, useFeedback } from '@/ui';
import { BrandLockup, BrandMark } from './Brand';
import { OfflineBanner } from './pwa';

/**
 * Navigation categories configured in the natural supply-chain order:
 * 1. Dashboard
 * 2. Purchase (Inward Grey Rolls / Traded Colored Rolls)
 * 3. Dyeing & Combing (processing lots: my DC -> dyeing unit -> combing unit -> received into stock)
 * 4. Sales (Sell Finished Rolls)
 * 5. Finance (Bank, Cash, and Ledger Tracking)
 * 6. Overview (Stocks, Profit/Revenue, Analytics, Expenses)
 *
 * Items flagged `tab: false` stay in the sidebar / drawer but are left out of the phone bottom tabs.
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
      { to: '/purchase/bin', label: 'Recycle Bin', short: 'Bin', icon: Trash2, tab: false },
    ],
  },
  {
    id: 'processing',
    title: 'Dyeing & Combing',
    icon: Layers,
    basePath: '/processing',
    home: '/processing/lots',
    items: [
      { to: '/processing/lots', label: 'Processing Lots', short: 'Lots', icon: Layers },
      { to: '/processing/completed', label: 'Completed Lots', short: 'Completed', icon: CheckCircle2 },
      { to: '/processing/dyeing-units', label: 'Dyeing Units', short: 'Dyers', icon: Users },
      { to: '/processing/combing-units', label: 'Combing Units', short: 'Combing', icon: Sparkles },
      { to: '/processing/old', label: 'Old Batches', short: 'Old', icon: Archive, tab: false },
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
      { to: '/sales/bin', label: 'Recycle Bin', short: 'Bin', icon: Trash2, tab: false },
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
      { to: '/overview/shortcuts', label: 'Product Shortcuts', short: 'Shortcuts', icon: Zap },
    ],
  },
];

/** Modules by id (dashboard included; it has no items). */
export const MODULES = Object.fromEntries(NAV_CATEGORIES.map((c) => [c.id, c]));

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

const OPEN_GROUPS_KEY = 'nav.openGroups';
/** Groups the user opened / closed, remembered on this device ({ [id]: true|false }). */
function readOpenGroups() {
  try {
    const saved = JSON.parse(storage.get(OPEN_GROUPS_KEY) ?? '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}
/** Which module the current page belongs to (its group opens automatically). */
const activeModuleId = (pathname) =>
  NAV_CATEGORIES.find((c) => c.basePath && pathname.startsWith(c.basePath))?.id ?? null;

/**
 * Navigation menu shared by the desktop sidebar and the phone drawer: the Dashboard link, then every module as a
 * dropdown that opens / closes its pages. The current module's group is opened when you navigate into it; every
 * open / close is remembered on this device.
 */
export function NavMenu({ onItemClick }) {
  const { pathname } = useLocation();
  const current = activeModuleId(pathname);
  const [open, setOpen] = useState(() => {
    const saved = readOpenGroups();
    return current ? { ...saved, [current]: true } : saved;
  });
  // entering another module opens its group (the others stay as the user left them)
  useEffect(() => {
    if (current) setOpen((o) => (o[current] ? o : { ...o, [current]: true }));
  }, [current]);
  const toggle = (id) =>
    setOpen((o) => {
      const next = { ...o, [id]: !o[id] };
      storage.set(OPEN_GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  return (
    <nav className="flex-1 scrollbar-thin overflow-y-auto px-3 py-4" aria-label="Main navigation">
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

        const Icon = category.icon;
        const isOpen = !!open[category.id];
        const isCurrent = category.id === current;
        const panelId = `nav-group-${category.id}`;
        return (
          <div key={category.id} className="mt-1">
            <button
              type="button"
              onClick={() => toggle(category.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={cn(
                'group flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition duration-150',
                isCurrent ? 'text-white' : 'text-brand-200 hover:bg-white/5 hover:text-white',
              )}
            >
              <Icon
                className={cn(
                  'size-[18px] shrink-0 transition',
                  isCurrent ? 'text-gold-300' : 'text-brand-300 group-hover:text-gold-300',
                )}
                aria-hidden
              />
              <span className="flex-1 truncate text-left">{category.title}</span>
              <ChevronDown
                className={cn('size-4 shrink-0 text-brand-400 transition-transform', isOpen && 'rotate-180')}
                aria-hidden
              />
            </button>
            <div
              id={panelId}
              hidden={!isOpen}
              className="ml-[1.35rem] space-y-0.5 border-l border-white/10 py-0.5 pl-2"
            >
              {category.items.map(({ to, label, icon: SubIcon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onItemClick}
                  className={({ isActive: itemActive }) =>
                    cn(
                      'group relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition duration-150',
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

      <NavMenu />

      <div className="space-y-3 border-t border-white/5 p-3">
        <UserCard onLogout={onLogout} />
        <p className="px-2 pb-1 text-center text-[10px] tracking-wide text-brand-400">
          Powered by {COMPANY.displayName}
        </p>
      </div>
    </aside>
  );
}

/** Page label for the breadcrumb (edit screens have no menu item of their own). */
function pageLabel(module, pathname, search) {
  if (pathname.startsWith('/sales/bill') && new URLSearchParams(search).has('edit')) return 'Edit Sales Bill';
  const page = (module?.items ?? []).find((i) => pathname.startsWith(i.to));
  return page?.label ?? (pathname.includes('/edit/') ? 'Edit Purchase Bill' : module?.title);
}

/** Desktop top bar: breadcrumb and today's date (the sidebar is the menu). */
function TopBar({ module }) {
  const { pathname, search } = useLocation();
  const label = pageLabel(module, pathname, search);

  return (
    <div className="no-print sticky top-0 z-20 hidden h-14 items-center justify-between gap-4 border-b border-line glass px-6 lg:flex">
      <nav className="flex min-w-0 items-center gap-2 text-sm" aria-label="Breadcrumb">
        <module.icon className="size-4 shrink-0 text-gold-600" aria-hidden />
        <NavLink
          to={module.home ?? module.to}
          end
          className="shrink-0 font-medium text-slate-500 hover:text-brand-800"
        >
          {module.title}
        </NavLink>
        {label && label !== module.title && (
          <>
            <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden />
            <span className="truncate font-semibold text-brand-800">{label}</span>
          </>
        )}
      </nav>

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
          <NavMenu onItemClick={onClose} />
        </div>

        <div className="border-t border-white/10 p-3">
          <UserCard onLogout={onLogout} />
        </div>
      </div>
    </div>
  );
}

/** Phone / tablet header: menu button, brand and module title (Dashboard and Logout live in the drawer). */
function MobileHeader({ module, onOpenMenu }) {
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
      <Link to="/" aria-label="Dashboard" className="shrink-0">
        <BrandMark size="sm" />
      </Link>
      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate font-display text-[15px] font-bold">{module.title}</h1>
        <p className="truncate text-[10px] tracking-[0.2em] text-gold-400 uppercase">{COMPANY.displayName}</p>
      </div>
    </header>
  );
}

/** Phone / tablet bottom tabs: the current module's main pages (items with `tab: false` are drawer-only). */
function BottomTabs({ module }) {
  const tabs = (module.items ?? []).filter((i) => i.tab !== false);
  if (!tabs.length) return null;
  return (
    <nav
      className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/10 surface-ink shadow-[0_-10px_30px_-12px_rgb(12_16_34/0.55)] lg:hidden"
      aria-label={`${module.title} navigation`}
    >
      <ul className="mx-auto flex max-w-2xl px-1">
        {tabs.map(({ to, short, icon: Icon }) => (
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
  const hasTabs = (module.items ?? []).some((i) => i.tab !== false);
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
        <main className={cn('flex-1 lg:pb-10', hasTabs ? 'pb-40' : 'pb-10')}>
          <Outlet />
        </main>
        <BottomTabs module={module} />
      </div>
    </div>
  );
}
