import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Toast, ToastRegion } from "@scttlnd/ui";
import { useI18n } from "@/i18n/i18n";

export type ToastVariant = "success" | "error" | "info";

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE = { success: "success", error: "danger", info: "info" } as const;

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

/** One toast at a time. Presentation, timing, pause-on-hover and dismissal come from @scttlnd/ui. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toast, setToast] = useState<ToastState | null>(null);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    idRef.current += 1;
    setToast({ id: idRef.current, message, variant });
  }, []);
  const dismiss = useCallback(() => setToast(null), []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastRegion label={t("common.notifications")}>
        {toast && (
          <Toast
            key={toast.id}
            tone={TONE[toast.variant]}
            duration={toast.variant === "error" ? undefined : 3200}
            dismissLabel={t("common.dismiss")}
            onDismiss={dismiss}
          >
            {toast.message}
          </Toast>
        )}
      </ToastRegion>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
