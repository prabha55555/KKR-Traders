import {
  AlertCircle,
  Boxes,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Mail,
  Phone,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  User,
  Users,
  Workflow,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';

import { COMPANY, PRODUCT, SERVICES } from '@/core/branding';
import { Button, TextField, cn } from '@/ui';
import { useAuth } from './AuthProvider';
import { BrandLockup, BrandLogo } from './Brand';
import { GoldWaves, Sparkle } from './Decor';

const SERVICE_ICONS = [ReceiptText, Workflow, Users, Smartphone, Globe];

function HeroPanel() {
  return (
    <section className="relative hidden overflow-hidden surface-ink p-12 text-white lg:flex lg:flex-col xl:p-16">
      <GoldWaves />
      <Sparkle className="absolute top-24 right-24 size-6 animate-float text-gold-300 opacity-80" />
      <div className="relative">
        <BrandLockup />
      </div>

      <div className="relative my-auto max-w-xl py-12">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-semibold tracking-[0.2em] text-gold-300 uppercase ring-1 ring-white/10">
          <ShieldCheck className="size-3.5" /> {PRODUCT.suite}
        </p>
        <h1 className="font-display text-4xl leading-[1.1] font-extrabold xl:text-5xl">
          Billing that moves your business <span className="text-gold-gradient">forward.</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-brand-200">
          Sales, purchases, stock, customers and finances — one elegant, reliable workspace that works on
          every screen, online or offline.
        </p>

        <ul className="mt-9 flex flex-wrap gap-2.5">
          {SERVICES.map((label, i) => {
            const Icon = SERVICE_ICONS[i] ?? Boxes;
            return (
              <li
                key={label}
                className="flex items-center gap-2 rounded-full bg-white/5 py-2 pr-4 pl-2.5 text-sm font-medium text-brand-100 ring-1 ring-white/10 backdrop-blur"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-gold-sheen text-brand-900">
                  <Icon className="size-3.5" />
                </span>
                {label}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-brand-300">
        <a href="tel:+917845081278" className="inline-flex items-center gap-2 transition hover:text-gold-300">
          <Phone className="size-4 text-gold-400" /> +91 7845081278
        </a>
        <a
          href="mailto:contact@brightlightsolutions.in"
          className="inline-flex items-center gap-2 transition hover:text-gold-300"
        >
          <Mail className="size-4 text-gold-400" /> contact@brightlightsolutions.in
        </a>
        <a
          href="https://www.brightlightsolutions.in"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 transition hover:text-gold-300"
        >
          <Globe className="size-4 text-gold-400" /> www.brightlightsolutions.in
        </a>
      </div>
    </section>
  );
}

export default function LoginPage() {
  const { signedIn, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const userRef = useRef(null);
  const passRef = useRef(null);

  useEffect(() => userRef.current?.focus(), []);
  if (signedIn) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await login(username, password);
    if (!ok) {
      setBusy(false);
      setError(true);
      setPassword('');
      userRef.current?.focus();
    }
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <HeroPanel />

      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4 sm:p-8 lg:min-h-0 lg:bg-canvas">
        {/* phones / tablets: the dark hero becomes the page background */}
        <div className="absolute inset-0 surface-ink lg:hidden">
          <GoldWaves />
        </div>

        <form
          onSubmit={submit}
          className={cn(
            'relative w-full max-w-md animate-rise rounded-3xl border border-white/60 bg-white p-7 shadow-pop sm:p-10',
            error && 'animate-shake',
          )}
          onAnimationEnd={(e) => e.animationName === 'shake' && setError(false)}
        >
          <span className="absolute inset-x-8 top-0 h-[2px] hairline-gold" aria-hidden />
          <div className="mb-7 text-center">
            <BrandLogo className="mx-auto w-44 sm:w-48" />
          </div>
          <h2 className="font-display text-2xl font-extrabold text-brand-800">Welcome back</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">Sign in to continue to {PRODUCT.name}.</p>

          <div className="space-y-4">
            <TextField
              ref={userRef}
              label="Username"
              leftIcon={User}
              value={username}
              onChange={(v) => setUsername(v)}
              placeholder="Enter username"
              autoComplete="username"
              required
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  passRef.current?.focus();
                }
              }}
            />
            <TextField
              ref={passRef}
              label="Password"
              leftIcon={KeyRound}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(v) => setPassword(v)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
              right={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />
          </div>

          {error ? (
            <p
              className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200"
              role="alert"
            >
              <AlertCircle className="size-4 shrink-0" /> Invalid username or password
            </p>
          ) : null}

          <Button type="submit" size="lg" fullWidth loading={busy} className="mt-6">
            Sign In
          </Button>

          <p className="mt-8 text-center text-xs text-slate-400">
            &copy; {new Date().getFullYear()} {COMPANY.displayName}. All rights reserved.
          </p>
          <p className="mt-1 text-center text-[11px] font-medium tracking-wide text-gold-700">
            {COMPANY.tagline}
          </p>
        </form>
      </main>
    </div>
  );
}
