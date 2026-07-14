import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ToastVariant = "success" | "error" | "info";

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: string; iconLabel: string }> = {
  success: { border: "border-l-success", icon: "✓", iconLabel: "bg-success-soft text-success-text" },
  error: { border: "border-l-danger", icon: "✕", iconLabel: "bg-danger-soft text-danger" },
  info: { border: "border-l-brand", icon: "ℹ", iconLabel: "bg-brand-soft text-brand-text" },
};

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    idRef.current += 1;
    setToast({ id: idRef.current, message, variant });
    timeoutRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const styles = toast ? VARIANT_STYLES[toast.variant] : null;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && styles && (
        <div
          key={toast.id}
          role="status"
          className={`fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-full border border-border border-l-4 ${styles.border} bg-surface px-4 py-3 shadow-lift animate-fade-up`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${styles.iconLabel}`}
            aria-hidden="true"
          >
            {styles.icon}
          </span>
          <span className="text-sm font-semibold leading-snug text-ink">{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
