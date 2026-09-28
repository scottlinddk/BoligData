import type { ReactNode } from "react";

/** Decorative: pair with visible text or a labelled status region. */
export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`ui-spinner ${className}`} />;
}

export function LoadingStatus({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span role="status" className={`inline-flex items-center gap-2 text-sm ${className}`}>
    <Spinner />{children}
  </span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`ui-skeleton rounded bg-surface-alt ${className}`} />;
}

export function PropertyCardSkeleton() {
  return <div aria-hidden="true">
    <Skeleton className="aspect-[8/5] rounded-2xl" />
    <Skeleton className="mt-4 h-6 w-1/2" />
    <Skeleton className="mt-2 h-5 w-4/5" />
    <Skeleton className="mt-1.5 h-5 w-2/3" />
    <Skeleton className="mt-2 h-4 w-1/3" />
  </div>;
}
