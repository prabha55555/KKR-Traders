# Brightlight Billing — Design Language

Premium · Modern · Reliable · Enterprise. The look is taken from the Brightlight Solutions identity: **brushed gold on
deep ink-black, on a warm ivory canvas**. Every screen is built from the same few ingredients so the whole product
feels like one piece.

## Tokens (`src/styles/index.css`)

| Token | Use |
| --- | --- |
| `brand-50 … 950` | **Ink** (blue-black). Text on light surfaces (`text-brand-800`), dark surfaces (`brand-900`), selected states. |
| `gold-50 … 900` | **Accent / primary action.** Icon tiles, focus rings, highlights, hover tints (`gold-50`), CTA gradient. |
| `slate-*` | Re-tinted neutrals (ink-tinted greys): body copy, borders, muted text. |
| `canvas` `#f6f5f1` | Page background (ivory). `line` `#e8e5dc` = hairline borders on white cards. |
| `emerald / red / amber / sky` | **Semantic only**: paid / due / warning / info. Never decoration. |
| `font-display` | Plus Jakarta Sans — headings, KPI numbers, totals. Body is Inter. Self-hosted (works offline). |
| utilities | `bg-gold-gradient`, `bg-gold-sheen` (buttons), `text-gold-gradient`, `surface-ink` (dark panel with gold glow), `hairline-gold`, `glass`, `shadow-card / lift / pop / gold`, `animate-rise` |

## Components (`@/ui`) — use these, don't re-style

* **Button** — `primary` = gold CTA (**at most one per view/section**), `secondary` = ink, `outline` = neutral secondary,
  `ghost`, `danger`/`outlineDanger` for destructive, `success`, `whatsapp`. Never hand-roll `bg-brand-600 text-white` buttons.
* **Page** — page title with gold icon tile + gold underline accent. **Card / SectionHeader** — white `rounded-2xl`
  surface; the section header has a gold icon tile. **StatCard** — KPI tile. **Badge** — status pill with ring.
* **DataTable** — ivory-gold hover rows, uppercase small-caps header; cards on phones. **Modal** — bottom sheet on phones,
  dialog on desktop, gold hairline top. **ChoiceChips** — selected = ink pill with gold text.
* **Fields** — rounded-xl, gold focus ring (`focus:border-gold-500 focus:ring-gold-100`), labels above.

## Patterns

* **Surfaces**: cards are `rounded-2xl border border-line bg-white shadow-card`. Inner "wells" use `bg-slate-50/70`
  or `bg-gold-50/60` with `rounded-xl`. Highlight/summary blocks (grand total, balance due) may use `Card tone="ink"`
  with gold numbers.
* **Typography**: page `h1` via `Page`; card titles via `SectionHeader`; labels 13px semibold slate-600;
  secondary text `text-slate-500`; **all money/quantities** `tabular-nums`; key totals `font-display font-extrabold`.
* **Money semantics**: due / negative = `text-red-600`, paid / positive = `text-emerald-600`, neutral = `text-brand-800`.
* **Icon tiles**: lucide icon inside `size-9 rounded-xl bg-gold-100 text-gold-700 ring-1 ring-gold-200` (hover → `bg-gold-sheen text-brand-900`).
* **Spacing**: page gutters come from `Page`; vertical rhythm `space-y-5`; card padding `p-4 sm:p-5`; grids `gap-3.5`/`gap-4`.
* **Motion**: `Page` fades in (`animate-rise`); stagger lists with `style={{ animationDelay }}` ≤ 400 ms; hover lift
  `hover:-translate-y-0.5 hover:shadow-lift`; buttons press with `active:scale-[0.985]`. Keep it subtle, never blocking.
* **Phones**: sticky action bars use `glass border-t border-line` + `pb-safe`, sit above the 3.6rem bottom tab bar
  (`bottom-[3.6rem]`‑ish) and keep ≥44px targets. Tables → cards, forms → bottom sheets.
* **Empty / loading / error**: `EmptyState` (gold icon tile) with a helpful sentence and, where it makes sense, an action;
  `Skeleton` shimmer rows instead of spinners for lists.
* **Dark surfaces** (`surface-ink`): text `text-white` / `text-brand-200`, muted `text-brand-300`, accents `text-gold-300`,
  borders `border-white/10`.
* **Print documents** (invoice / statement HTML in `src/core/services/invoiceHtml.js`, `features/history/lib/statementHtml.js`)
  are separate, white-paper layouts — do not theme them with app tokens.

## Branding

Company name, tagline, address, phone, e-mail, website and credit line live in `src/core/branding.js`. Logo files are in
`src/assets/brand/` (`logo.png` full colour, `mark.png` monogram); PWA icons in `public/`. The monogram sits on a white
tile (`app/Brand.jsx → BrandMark`) so it reads on dark and light surfaces.
