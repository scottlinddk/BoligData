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
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
