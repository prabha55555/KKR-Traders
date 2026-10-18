/**
 * Settings — the details of the business that uses the app (name, address, GST number, logo, bill texts …), printed
 * on its bills, statements, DCs and shared messages, plus the app login. Stored in the business's own database
 * (core/business.js, core/auth.js); its customers and suppliers are managed in their own sections.
 */
import {
  Building2,
  Contact,
  LayoutGrid,
  MessageCircle,
  Receipt,
  RotateCcw,
  Save,
  Settings,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';

import { useAuth } from '@/app/AuthProvider';
import { VENDOR } from '@/core/branding';
import {
  DEFAULT_BUSINESS,
  isBusinessConfigured,
  monogramOf,
  normalizeBusiness,
  purchaseAckLine,
} from '@/core/business';
import { MODULE_PLANS, MODULE_TITLES } from '@/core/modules';
import {
  Badge,
  Button,
  Card,
  ChoiceChips,
  Grid,
  LoadingState,
  Page,
  SectionHeader,
  TextArea,
  TextField,
  TwoPane,
  cn,
  useFeedback,
} from '@/ui';
import { BusinessPreview } from './BusinessPreview';
import { LoginCard } from './LoginCard';
import { LogoField } from './LogoField';
import { BUSINESS_FIELDS, useBusinessForm } from './useBusinessForm';

/** Quick picks for the heading of the printed sales bill. */
const BILL_TITLES = ['ESTIMATED COPY', 'TAX INVOICE', 'INVOICE', 'CASH BILL', 'ESTIMATE'].map((t) => ({
  value: t,
  label: t,
}));

const fieldId = (key) => `business-${key}`;
const upper = (v) => v.toUpperCase();

function Section({ title, icon, children }) {
  return (
    <Card as="section" aria-label={title}>
      <SectionHeader title={title} icon={icon} />
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const { username } = useAuth();
  const { toast } = useFeedback();
  const biz = useBusinessForm();
  const pageProps = { title: 'Settings', icon: Settings };

  if (!biz.ready) {
    return (
      <Page {...pageProps}>
        <LoadingState label="Loading your business details…" />
      </Page>
    );
  }

  const { form, errors } = biz;
  /** value / onChange / error / id of one business field (`transform` = applied as typed, e.g. capitals) */
  const bind = (key, transform) => ({
    id: fieldId(key),
    value: form[key],
    error: errors[key],
    onChange: (v) => biz.setField(key, transform ? transform(v) : v),
  });
  // what the blank fields fall back to, from the values being typed
  const typed = normalizeBusiness(form);
  const monogramPlaceholder = monogramOf({ ...typed, monogram: '' });
  const ackPlaceholder = purchaseAckLine({ ...typed, purchaseAckMessage: '' });

  const onSubmit = async (e) => {
    e.preventDefault();
    const result = await biz.save();
    if (result.ok) {
      toast('Settings saved', 'Bills, statements and messages now use these details.', 'success');
      return;
    }
    if (!result.error) return; // a second tap while saving
    toast('Settings not saved', result.error, 'error');
    const first = BUSINESS_FIELDS.find((k) => result.errors?.[k]);
    if (first) document.getElementById(fieldId(first))?.focus();
  };

  const businessForm = (
    <form onSubmit={onSubmit} noValidate aria-label="Business details" className="space-y-5">
      <Section title="Modules" icon={LayoutGrid}>
        <p className="-mt-1 mb-3 text-sm text-slate-600">
          Which parts of the app this client uses. Modules left out are hidden from the menu and the dashboard
          and cannot be opened; their data is kept, and choosing a larger plan shows them again.
        </p>
        <div role="radiogroup" aria-label="Module plan" className="grid gap-3 md:grid-cols-3">
          {MODULE_PLANS.map((plan, i) => {
            const active = form.modulePlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => biz.setField('modulePlan', plan.id)}
                className={cn(
                  'flex flex-col rounded-2xl border p-3.5 text-left transition focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none',
                  active
                    ? 'border-gold-400 bg-gold-50 ring-1 ring-gold-300'
                    : 'border-line bg-white hover:border-gold-300 hover:bg-gold-50/50',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    Option {i + 1}
                  </span>
                  {active ? <Badge tone="success">Selected</Badge> : null}
                </span>
                <span className="mt-1 font-display font-bold text-brand-800">{plan.title}</span>
                <span className="mt-2 flex flex-wrap gap-1">
                  {plan.modules.map((m) => (
                    <Badge key={m} tone={m === 'settings' ? 'neutral' : 'info'}>
                      {MODULE_TITLES[m]}
                    </Badge>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {errors.modulePlan ? (
          <p className="mt-2 text-xs font-medium text-red-600" role="alert">
            {errors.modulePlan}
          </p>
        ) : null}
      </Section>

      <Section title="Business profile" icon={Building2}>
        <Grid cols={{ base: 1, sm: 2 }}>
          <TextField
            label={
              <>
                Business name <span className="text-red-500">*</span>
              </>
            }
            required
            autoComplete="organization"
            placeholder="e.g. Ganesh Textiles"
            hint="As you write it — bills print it in capitals."
            {...bind('name')}
          />
          <TextField
            label="Tagline"
            placeholder="e.g. Quality fabrics since 1990"
            hint="Short line beside the logo on bills and under the dashboard welcome."
            {...bind('tagline')}
          />
          <TextField
            label="Greeting name"
            placeholder={username || 'Your login username'}
            hint="Dashboard greeting “Good morning, …”. Blank = your login username."
            {...bind('ownerName')}
          />
          <TextField
            label="Welcome heading"
            placeholder={`Welcome to ${typed.name || 'your business'}`}
            hint="Big heading on the dashboard. Blank = the text shown."
            {...bind('welcomeMessage')}
          />
          <TextField
            label="Watermark initials"
            placeholder={monogramPlaceholder || 'e.g. GT'}
            maxLength={6}
            autoCapitalize="characters"
            hint="Faint initials behind bills and statements. Blank = initials of the business name."
            {...bind('monogram')}
          />
          <LogoField
            id={fieldId('logo')}
            value={form.logo}
            error={errors.logo}
            onChange={(v) => biz.setField('logo', v)}
          />
        </Grid>
      </Section>

      <Section title="Contact & tax" icon={Contact}>
        <Grid cols={{ base: 1, sm: 2 }}>
          <TextArea
            label="Address"
            rows={2}
            autoComplete="street-address"
            placeholder="e.g. 12, Market Road, Erode - 638 001"
            hint="Printed in the heading of bills, statements and DCs."
            className="sm:col-span-2"
            {...bind('address')}
          />
          <TextField
            label="Phone numbers"
            inputMode="tel"
            autoComplete="tel"
            placeholder="e.g. 98400 11111, 90000 22222"
            hint="Printed as “CELL: …”. Separate numbers with commas."
            {...bind('phones')}
          />
          <TextField
            label="E-mail"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="e.g. sales@yourshop.in"
            {...bind('email')}
          />
          <TextField
            label="Website"
            inputMode="url"
            autoCapitalize="none"
            placeholder="e.g. www.yourshop.in"
            {...bind('website')}
          />
          <TextField
            label="GST number"
            autoCapitalize="characters"
            maxLength={15}
            spellCheck={false}
            placeholder="e.g. 33ABCDE1234F1Z5"
            hint="15 characters, printed as “GSTIN: …”. Blank = not printed."
            {...bind('gstin', upper)}
          />
        </Grid>
      </Section>

      <Section title="Sales bill" icon={Receipt}>
        <Grid cols={{ base: 1, sm: 2 }}>
          <div className="min-w-0 space-y-2 sm:col-span-2">
            <TextField
              label="Bill heading"
              placeholder={DEFAULT_BUSINESS.salesBillTitle}
              hint="Title at the top right of the printed bill — type your own or pick one below."
              {...bind('salesBillTitle')}
            />
            <ChoiceChips
              label="Bill heading quick picks"
              value={form.salesBillTitle}
              onChange={(v) => biz.setField('salesBillTitle', v)}
              options={BILL_TITLES}
            />
          </div>
          <TextField
            label="Payment number"
            inputMode="tel"
            placeholder="e.g. 98400 11111"
            hint="Printed as “Payment No : …” under the amount in words (GPay / PhonePe number)."
            {...bind('paymentNo')}
          />
          <TextField
            label="Bank name"
            placeholder="e.g. State Bank of India"
            hint="Bank details print under the payment number."
            {...bind('bankName')}
          />
          <TextField
            label="Account number"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 123456789012"
            {...bind('bankAccountNo')}
          />
          <TextField
            label="IFSC"
            autoCapitalize="characters"
            maxLength={11}
            spellCheck={false}
            placeholder="e.g. SBIN0001234"
            {...bind('bankIfsc', upper)}
          />
          <TextField
            label="UPI ID"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="e.g. yourshop@okaxis"
            {...bind('upiId')}
          />
          <TextArea
            label="Terms printed above the signatures"
            rows={4}
            hint="One line each. Leave blank to print none."
            className="sm:col-span-2"
            {...bind('billTerms')}
          />
        </Grid>
      </Section>

      <Section title="Purchase" icon={ShoppingCart}>
        <TextField
          label="Acknowledgement closing line"
          placeholder={ackPlaceholder}
          hint="Last line of the acknowledgement sent to a supplier for a purchase. Blank = the line shown."
          {...bind('purchaseAckMessage')}
        />
      </Section>

      <Section title="Bill sharing (WhatsApp)" icon={MessageCircle}>
        <Grid cols={{ base: 1, sm: 2 }}>
          <TextField
            label="Town"
            placeholder="e.g. Tirupur"
            hint="Shown with your contact details in shared statements."
            {...bind('shareLocation')}
          />
          <TextField
            label="Phone numbers in messages"
            inputMode="tel"
            placeholder={typed.phones || 'Same as your phone numbers'}
            hint="Blank = the phone numbers under Contact & tax."
            {...bind('sharePhones')}
          />
        </Grid>
      </Section>

      {/* stays in view while the form scrolls (until its end) */}
      <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-line bg-white/95 p-3 shadow-lift backdrop-blur">
        <div className="mr-auto min-w-0">
          {biz.dirty ? (
            <Badge status="pending">Unsaved changes</Badge>
          ) : (
            <span className="text-xs font-medium text-slate-500">All changes saved</span>
          )}
        </div>
        <Button variant="neutral" icon={RotateCcw} onClick={biz.reset} disabled={!biz.dirty || biz.saving}>
          Reset
        </Button>
        <Button
          type="submit"
          variant="success"
          icon={Save}
          loading={biz.saving}
          disabled={biz.loadFailed}
          title={biz.loadFailed ? 'Saving is blocked until the saved settings load' : undefined}
        >
          Save settings
        </Button>
      </div>
    </form>
  );

  return (
    <Page {...pageProps}>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-slate-600">
        The client’s <strong className="text-brand-800">business details</strong> (printed on their bills,
        statements and DCs and in the messages they share), the{' '}
        <strong className="text-brand-800">modules</strong> they use and their{' '}
        <strong className="text-brand-800">login</strong>. Their customers and suppliers are managed in their
        own sections.
      </p>

      {biz.loadFailed ? (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-card"
        >
          <p className="min-w-0 flex-1 text-sm font-medium text-red-700">
            The saved settings could not be loaded (check the internet connection). The details below are the
            copy on this device and may be out of date, so saving is blocked until they load.
          </p>
          <Button variant="info" icon={RotateCcw} onClick={() => void biz.retry()}>
            Try again
          </Button>
        </div>
      ) : null}

      {!biz.loadFailed && !isBusinessConfigured() ? (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-2xl border border-gold-300 bg-gold-50 p-4 shadow-card"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold-sheen text-brand-900">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <p className="min-w-0 text-sm font-medium text-brand-800">
            Fill in your business details and press Save — they will appear on every bill.
          </p>
        </div>
      ) : null}

      <TwoPane main={businessForm} side={<BusinessPreview values={form} username={username} />} />

      <div className="mt-5">
        <LoginCard />
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">Powered by {VENDOR.name}</p>
    </Page>
  );
}
