export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
    <path d="M3 16.5 16 4l13 12.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 15v13h6v-8h5v8h6V15L16 7Z" fill="currentColor" />
    <path d="M22.5 5.5v6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M14 14h4" stroke="var(--color-surface)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}
