import { cn } from '@/ui';

/**
 * Decorative gold / black ribbons echoing the Brightlight identity card. Pure SVG, sits behind content
 * (`absolute inset-0`), ignores pointer events.
 */
export function GoldWaves({ className }) {
  return (
    <svg
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <defs>
        <linearGradient id="bl-gold-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe08a" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#f2bb25" stopOpacity="0.55" />
          <stop offset="1" stopColor="#b9830f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bl-gold-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2bb25" stopOpacity="0.5" />
          <stop offset="1" stopColor="#f2bb25" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bl-ink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* upper-right sweep */}
      <path d="M800 0 V210 C640 190 520 120 430 0 Z" fill="url(#bl-ink)" />
      <path d="M800 40 C690 70 590 40 505 -20" stroke="url(#bl-gold-a)" strokeWidth="2.5" />
      <path d="M800 78 C680 118 570 82 470 -10" stroke="url(#bl-gold-b)" strokeWidth="1.5" />
      <path d="M800 118 C660 170 540 126 430 8" stroke="url(#bl-gold-b)" strokeWidth="1" />
      {/* lower-left sweep */}
      <path d="M-10 600 V470 C120 500 250 560 360 610 Z" fill="url(#bl-ink)" />
      <path d="M-10 520 C110 540 230 585 330 640" stroke="url(#bl-gold-a)" strokeWidth="2.5" />
      <path d="M-10 480 C120 500 250 548 360 610" stroke="url(#bl-gold-b)" strokeWidth="1.5" />
      <circle cx="700" cy="470" r="2.5" fill="#f2bb25" opacity="0.7" />
      <circle cx="120" cy="140" r="2" fill="#f2bb25" opacity="0.5" />
      <circle cx="610" cy="260" r="1.5" fill="#fff" opacity="0.5" />
    </svg>
  );
}

/** Four-point gold sparkle (the star from the logo). */
export function Sparkle({ className }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0c.7 6.2 2.8 9.3 12 12-9.2 2.7-11.3 5.8-12 12-.7-6.2-2.8-9.3-12-12C9.2 9.3 11.3 6.2 12 0z" />
    </svg>
  );
}
