/**
 * ScrollToTopButton – round floating button that appears once the page is scrolled down
 * (the web page's scroll-to-top button). Listens to the window scroll itself.
 *
 * Props: threshold (px, default 300) · className (extra positioning classes).
 */
import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/ui';

export function ScrollToTopButton({ threshold = 300, className }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label="Scroll to top"
      title="Scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={cn(
        'fixed right-4 bottom-24 z-30 flex size-12 animate-fade-in items-center justify-center rounded-full border border-gold-400/50 bg-linear-to-b from-brand-600 to-brand-800 text-gold-300 shadow-pop transition duration-200 hover:-translate-y-0.5 hover:text-gold-200 hover:shadow-gold focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 lg:right-8 lg:bottom-8',
        className,
      )}
    >
      <ArrowUp className="size-6" aria-hidden />
    </button>
  );
}
