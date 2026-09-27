export function BrandMark({ className = "h-7 w-7", cutoutColor = "var(--color-surface)" }: { className?: string; cutoutColor?: string }) {
  return <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
    <path d="m3 14 13-10 13 10M7.5 12v15h6v-8h5v8h6V12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22.5 5.5v3M12.5 12.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="16" cy="12.5" r="1.6" fill={cutoutColor} stroke="currentColor" strokeWidth="1.5" />
  </svg>;
}
