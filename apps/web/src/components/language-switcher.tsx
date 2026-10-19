import { useI18n } from "@/i18n/i18n";
import { LANGUAGES, LANGUAGE_LABELS, type Language } from "@/i18n/translations";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="flex items-center">
      <span className="sr-only">{t("controls.language")}</span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        aria-label={t("controls.language")}
        className="min-h-10 rounded-full border border-transparent bg-surface-alt px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-surface-hover"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {LANGUAGE_LABELS[lang]}
          </option>
        ))}
      </select>
    </label>
  );
}
