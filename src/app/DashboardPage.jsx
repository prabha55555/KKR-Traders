import {
  ArrowUpRight,
  CalendarDays,
  Clock,
  Globe,
  LogOut,
  Mail,
  MapPin,
  PieChart,
  Phone,
  Receipt,
  Share,
  ShoppingCart,
  Sparkles,
  Landmark,
  Layers,
} from 'lucide-react';
import { Link } from 'react-router';

import { COMPANY, PRODUCT, SERVICES } from '@/core/branding';
import { formatDateShort, todayISO } from '@/core/format';
import { Button, useFeedback } from '@/ui';
import { useAuth } from './AuthProvider';
import { BrandLockup } from './Brand';
import { GoldWaves, Sparkle } from './Decor';
import { InstallButton, OfflineBanner, useInstallPrompt } from './pwa';

const MODULE_CARDS = [
  {
    to: '/purchase/bill',
    title: 'Purchase',
    text: 'Record purchases, track supplier balances and acknowledge goods received.',
    icon: ShoppingCart,
    points: ['Purchase bills', 'Supplier ledger', 'Payments & returns'],
  },
  {
    to: '/processing/lots',
    title: 'Dyeing & Combing',
    text: 'Send grey fabric for dyeing and combing on your DC, track every unit DC, weight loss and the finished stock.',
    icon: Layers,
    points: ['Processing lots & DCs', 'Weight loss & cost per kg', 'Unit payments'],
  },
  {
    to: '/sales/bill',
    title: 'Sales',
    text: 'Create invoices, collect payments and keep every customer ledger in order.',
    icon: Receipt,
    points: ['Sales bills & printing', 'History & statements', 'Customer details'],
  },
  {
    to: '/finance/accounts',
    title: 'Finance',
    text: 'Manage money borrowings, bank accounts and cash in hand.',
    icon: Landmark,
    points: ['Bank & Cash balances', 'Loans & borrowings', 'Auto-calculated interest'],
  },
  {
    to: '/overview/revenue',
    title: 'Overview',
    text: 'Understand revenue, stock and expenses at a glance.',
    icon: PieChart,
    points: ['Revenue & profit', 'Live stock levels', 'Expense tracking'],
  },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { logout, username } = useAuth();
  const { confirm } = useFeedback();
  const { showIosHint } = useInstallPrompt();

  const onLogout = async () => {
    const ok = await confirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      tone: 'danger',
      confirmText: 'Logout',
    });
    if (ok) await logout();
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <OfflineBanner />

      {/* ---------------------------------------------------------------- hero */}
      <header className="pt-safe relative overflow-hidden rounded-b-[2.25rem] surface-ink pb-28 text-white sm:pb-32">
        <GoldWaves />
        <Sparkle className="absolute top-28 right-[14%] hidden size-6 animate-float text-gold-300 opacity-80 sm:block" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3 py-5">
            <BrandLockup />
            <div className="flex items-center gap-2">
              <InstallButton className="hidden sm:inline-flex" />
              <Button variant="danger" size="sm" icon={LogOut} onClick={onLogout}>
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>

          <div className="animate-rise pt-6 pb-2 sm:pt-10">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-gold-300">
              <Sparkles className="size-4" /> {greeting()}
              {username ? `, ${username}` : ''}
            </p>
            <h1 className="mt-2 max-w-2xl font-display text-3xl leading-[1.12] font-extrabold sm:text-5xl">
              Welcome to <span className="text-gold-gradient">{PRODUCT.name}</span>
            </h1>
            {COMPANY.tagline ? (
              <p className="mt-3 max-w-xl text-base text-brand-200 sm:text-lg">{COMPANY.tagline}.</p>
            ) : null}
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm text-brand-100 ring-1 ring-white/10 backdrop-blur">
              <CalendarDays className="size-4 text-gold-400" /> {formatDateShort(todayISO())}
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ content */}
      <main className="pb-safe relative mx-auto -mt-20 max-w-7xl px-4 pb-12 sm:-mt-24 sm:px-6 lg:px-8">
        <section aria-label="Modules" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_CARDS.map(({ to, title, text, icon: Icon, points }, i) => (
            <Link
              key={to}
              to={to}
              style={{ animationDelay: `${120 + i * 90}ms` }}
              className="group relative flex animate-rise flex-col overflow-hidden rounded-3xl border border-line bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1.5 hover:border-gold-300 hover:shadow-lift focus-visible:ring-4 focus-visible:ring-gold-200 focus-visible:outline-none"
            >
              <span className="absolute inset-x-0 top-0 h-[2px] hairline-gold opacity-0 transition group-hover:opacity-100" />
              <div className="flex items-start justify-between">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-gold-sheen text-brand-900 shadow-gold">
                  <Icon className="size-7" aria-hidden />
                </span>
                <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-brand-800 group-hover:text-gold-300">
                  <ArrowUpRight className="size-[18px]" aria-hidden />
                </span>
              </div>
              <h2 className="mt-5 font-display text-xl font-extrabold text-brand-800">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{text}</p>
              <ul className="mt-5 hidden space-y-1.5 border-t border-line pt-4 md:block">
                {points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
                    <span className="size-1.5 rounded-full bg-gold-400" /> {p}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </section>

        {showIosHint ? (
          <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-slate-500">
            Install this app: tap <Share className="size-4" aria-label="Share" /> then “Add to Home Screen”.
          </p>
        ) : null}
        <div className="mt-6 flex justify-center sm:hidden">
          <InstallButton />
        </div>
      </main>

      {/* ------------------------------------------------------ company footer */}
      <footer className="relative mt-auto overflow-hidden surface-ink text-white">
        <GoldWaves className="opacity-60" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.03]">
          <span className="font-display text-[12vw] font-black tracking-tighter whitespace-nowrap text-white uppercase">
            BRIGHTLIGHT SOLUTIONS
          </span>
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="relative grid gap-8 md:grid-cols-[1.1fr_1fr]">
            <div>
              <h2 className="font-display text-xl font-extrabold">Brightlight Solutions</h2>
              <p className="mt-1 text-sm text-gold-300">Technology That Moves Business Forward</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {SERVICES.map((s) => (
                  <li
                    key={s}
                    className="rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-brand-100 ring-1 ring-white/10"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <ul className="space-y-3 text-sm text-brand-100">
              {[
                [Phone, '+91 78450 81278', 'tel:+917845081278'],
                [Mail, 'contact@brightlightsolutions.in', 'mailto:contact@brightlightsolutions.in'],
                [Globe, 'www.brightlightsolutions.in', 'https://www.brightlightsolutions.in'],
                [
                  MapPin,
                  'Kamatchi Amman Kovil Street, Kumarananthapuram, Tiruppur, Tamil Nadu 641602, India',
                  'https://www.google.com/maps/search/?api=1&query=Kamatchi+Amman+Kovil+Street,+Kumarananthapuram,+Tiruppur,+Tamil+Nadu+641602,+India',
                ],
                [Clock, 'Business hours: 24 Hours', null],
              ].map(([Icon, text, href]) => (
                <li key={text}>
                  {href ? (
                    <a
                      href={href}
                      target={href.startsWith('http') ? '_blank' : undefined}
                      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="group flex items-center gap-3 rounded-lg transition hover:text-gold-300 focus-visible:ring-2 focus-visible:ring-gold-300 focus-visible:outline-none"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gold-sheen text-brand-900">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 leading-snug break-words group-hover:underline">{text}</span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gold-sheen text-brand-900">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="leading-snug">{text}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative mt-7 border-t border-white/10 pt-4 text-center text-xs text-brand-300">
            &copy; {new Date().getFullYear()} {COMPANY.displayName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
