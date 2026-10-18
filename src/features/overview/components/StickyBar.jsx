/** Phone-only bar that sticks just above the bottom tab bar (used for running totals). */
export default function StickyBar({ children }) {
  return (
    <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 mt-3 rounded-2xl border border-gold-200 bg-white px-4 py-3 shadow-pop lg:hidden">
      {children}
    </div>
  );
}
