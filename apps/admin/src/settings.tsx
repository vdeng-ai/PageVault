import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { languageLocale, translate, type Language, type MessageArgs, type TranslationKey } from "./i18n.js";

export type { Language, TranslationKey } from "./i18n.js";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const LANGUAGE_STORAGE_KEY = "pagevault.admin.language";
export const THEME_STORAGE_KEY = "pagevault.admin.theme";

const LANGUAGES: readonly Language[] = ["en", "zh-CN"];
const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

export function parseLanguage(value: unknown): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : "en";
}

export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === "dark") {
    return "dark";
  }
  if (preference === "light") {
    return "light";
  }
  return systemDark ? "dark" : "light";
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; the in-memory setting still applies.
  }
}

function getSystemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

type SettingsContextValue = {
  language: Language;
  locale: string;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setLanguage: (language: Language) => void;
  setThemePreference: (theme: ThemePreference) => void;
  t: (key: TranslationKey, args?: MessageArgs) => string;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: PropsWithChildren) {
  const [language, setLanguage] = useState<Language>(() => parseLanguage(readStorage(LANGUAGE_STORAGE_KEY)));
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    parseThemePreference(readStorage(THEME_STORAGE_KEY)),
  );
  const [systemDark, setSystemDark] = useState(getSystemDark);

  const resolvedTheme = resolveTheme(themePreference, systemDark);
  const locale = languageLocale(language);

  useEffect(() => {
    writeStorage(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    writeStorage(THEME_STORAGE_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [language, resolvedTheme]);

  const t = useCallback(
    (key: TranslationKey, args?: MessageArgs) => translate(language, key, args),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      locale,
      themePreference,
      resolvedTheme,
      setLanguage,
      setThemePreference,
      t
    }),
    [language, locale, themePreference, resolvedTheme, t],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error("useSettings must be used inside SettingsProvider");
  }
  return value;
}
