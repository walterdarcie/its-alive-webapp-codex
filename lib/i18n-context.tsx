"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Locale, LocaleDict } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pt } from "@/lib/locales/pt";
import { en } from "@/lib/locales/en";
import { es } from "@/lib/locales/es";

const DICTS: Record<Locale, LocaleDict> = { pt, en, es };

function detectLocaleFromBrowser(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = (navigator.languages?.[0] ?? navigator.language ?? "").toLowerCase();
  if (lang.startsWith("pt")) return "pt";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

type LocaleContextValue = {
  locale: Locale;
  t: LocaleDict;
  formatDate: (isoDate: string) => string;
  formatPostDate: (isoTimestamp: string) => string;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: pt,
  formatDate: () => "",
  formatPostDate: () => "",
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const detected = detectLocaleFromBrowser();
    setLocale(detected);
  }, []);

  useEffect(() => {
    const intlLocale = locale === "pt" ? "pt-BR" : locale === "es" ? "es-ES" : "en-US";
    document.documentElement.lang = intlLocale;
  }, [locale]);

  const t = useMemo(() => DICTS[locale], [locale]);

  const formatDate = useCallback(
    (isoDate: string) => {
      const date = new Date(`${isoDate}T00:00:00`);
      const day = String(date.getDate()).padStart(2, "0");
      const month = t.months[date.getMonth()] ?? "";
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
    },
    [t]
  );

  const formatPostDate = useCallback(
    (isoTimestamp: string) => {
      const date = new Date(isoTimestamp);
      const month = t.months[date.getMonth()] ?? "";
      return `${date.getDate()} ${month.toLowerCase()} ${date.getFullYear()}`;
    },
    [t]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t, formatDate, formatPostDate }),
    [locale, t, formatDate, formatPostDate]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
