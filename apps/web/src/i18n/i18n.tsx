import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  translations,
  type Language,
  type TranslationKey,
} from "./translations";

const STORAGE_KEY = "boligdata.lang";

export type TranslateVars = Record<string, string | number>;
export type TranslateFn = (key: TranslationKey, vars?: TranslateVars) => string;

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as string[]).includes(value);
}

function readInitialLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => setLanguageState(next), []);

  const t = useCallback<TranslateFn>(
    (key, vars) => interpolate(translations[language][key], vars),
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within an I18nProvider");
  return context;
}

/** Convenience hook when a component only needs the translate function. */
export function useT(): TranslateFn {
  return useI18n().t;
}
