import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { MyConnection } from "@shared/types/api";

/** Renders a list of the caller's resolved advisor/agent<->customer connections (contact card style). */
export function ConnectionList({
  connections,
  titleKey,
  emptyKey,
}: {
  connections: MyConnection[];
  titleKey: TranslationKey;
  emptyKey: TranslationKey;
}) {
  const { t, language } = useI18n();
  const dateLocale = language === "da" ? "da-DK" : "en-GB";

  return (
    <div className="mb-8">
      <h2 className="mb-2 font-semibold text-ink-soft">{t(titleKey)}</h2>
      {connections.length === 0 && <p className="font-semibold text-ink-soft">{t(emptyKey)}</p>}
      {connections.length > 0 && (
        <ul className="flex flex-col gap-2">
          {connections.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3"
            >
              <div>
                <div className="flex items-center gap-1.5 font-bold text-ink">
                  {c.otherUserEmail || c.otherUserId}
                  <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">
                    {t(c.otherUserRole === "agent" ? "role.agent" : c.otherUserRole === "advisor" ? "role.advisor" : "role.user")}
                  </span>
                </div>
                <div className="text-xs font-semibold text-ink-soft">
                  {t("connections.since", { date: new Date(c.createdAt).toLocaleDateString(dateLocale) })}
                </div>
              </div>
              {c.otherUserEmail && (
                <a
                  href={`mailto:${c.otherUserEmail}`}
                  className="rounded-full bg-cta px-3 py-1.5 text-sm font-bold text-cta-text transition hover:bg-cta-hover"
                >
                  {t("connections.contact")}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
