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
        className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-alt"
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
