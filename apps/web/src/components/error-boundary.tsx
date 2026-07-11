import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { useI18n } from "@/i18n/i18n";

/** Route-level errorElement — catches render/loader/action errors so a thrown
 * exception anywhere in a route's tree shows a recoverable page instead of a
 * blank white screen. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const { t } = useI18n();

  if (import.meta.env.DEV) {
    console.error(error);
  }

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
      <h1 className="font-serif text-2xl italic text-ink">{t("errorBoundary.title")}</h1>
      <p className="font-semibold text-ink-soft">{t("errorBoundary.description")}</p>
      {message && (
        <p className="max-w-full break-words font-mono text-xs text-ink-faint">{message}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover"
        >
          {t("errorBoundary.reload")}
        </button>
        <a
          href="/"
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper"
        >
          {t("errorBoundary.goHome")}
        </a>
      </div>
    </div>
  );
}
