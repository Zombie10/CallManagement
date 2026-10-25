import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_ADMIN_LOCALE,
  initialAdminLocale,
  translate,
  type AdminLocale,
} from "../lib/i18n";

const STORAGE_KEY = "callmgmt.adminLocale";

type LocaleContextValue = {
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): AdminLocale {
  try {
    return initialAdminLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_ADMIN_LOCALE;
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>(readStoredLocale);

  const setLocale = (next: AdminLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the in-memory choice still applies for this visit */
    }
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(key, locale, vars),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useUiLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useUiLocale requires LocaleProvider");
  }
  return value;
}
