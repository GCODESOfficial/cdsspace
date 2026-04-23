"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "fr" | "es" | "pt" | "ar" | "de" | "yo" | "ig" | "ha";

export const LOCALES: { code: Locale; label: string; nativeLabel: string; rtl?: boolean }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", rtl: true },
  { code: "yo", label: "Yoruba", nativeLabel: "Yorùbá" },
  { code: "ig", label: "Igbo", nativeLabel: "Igbo" },
  { code: "ha", label: "Hausa", nativeLabel: "Hausa" },
];

const dictionaries: Record<Locale, Record<string, string>> = {
  en: {
    "nav.overview": "Overview",
    "nav.work": "Work",
    "nav.chat": "Chat",
    "nav.protectDocs": "Protect Docs",
    "nav.cmeet": "cMeet",
    "nav.cdocs": "cDocs",
    "nav.csign": "cSign",
    "nav.cresume": "cResume",
    "nav.adminDashboard": "Admin Dashboard",
    "nav.settings": "Settings",
    "nav.logout": "Log out",
    "overview.welcome": "Welcome back",
    "overview.assignedWork": "Assigned work",
    "overview.unreadMessages": "Unread messages",
    "overview.upcomingMeetings": "Upcoming meetings",
    "settings.profile": "Profile",
    "settings.security": "Security",
    "settings.language": "Language",
    "settings.changePassword": "Change password",
    "settings.currentPassword": "Current password",
    "settings.newPassword": "New password",
    "settings.confirmPassword": "Confirm new password",
    "common.save": "Save changes",
    "common.saving": "Saving…",
    "common.cancel": "Cancel",
    "common.loading": "Loading…",
    "common.search": "Search",
  },
  fr: {
    "nav.overview": "Aperçu",
    "nav.work": "Travail",
    "nav.chat": "Discussion",
    "nav.protectDocs": "Docs protégés",
    "nav.cmeet": "cMeet",
    "nav.cdocs": "cDocs",
    "nav.csign": "cSign",
    "nav.cresume": "cResume",
    "nav.adminDashboard": "Tableau admin",
    "nav.settings": "Paramètres",
    "nav.logout": "Déconnexion",
    "overview.welcome": "Bon retour",
    "overview.assignedWork": "Travail assigné",
    "overview.unreadMessages": "Messages non lus",
    "overview.upcomingMeetings": "Réunions à venir",
    "settings.profile": "Profil",
    "settings.security": "Sécurité",
    "settings.language": "Langue",
    "settings.changePassword": "Changer le mot de passe",
    "settings.currentPassword": "Mot de passe actuel",
    "settings.newPassword": "Nouveau mot de passe",
    "settings.confirmPassword": "Confirmer le mot de passe",
    "common.save": "Enregistrer",
    "common.saving": "Enregistrement…",
    "common.cancel": "Annuler",
    "common.loading": "Chargement…",
    "common.search": "Rechercher",
  },
  es: {}, pt: {}, ar: {}, de: {}, yo: {}, ig: {}, ha: {},
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "cdsspace_locale";

export function I18nProvider({
  children,
  defaultLocale = "en",
}: {
  children: React.ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && LOCALES.some((l) => l.code === stored)) {
      setLocaleState(stored);
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
      const meta = LOCALES.find((x) => x.code === l);
      document.documentElement.dir = meta?.rtl ? "rtl" : "ltr";
      document.documentElement.lang = l;
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const dict = dictionaries[locale] || {};
      return dict[key] || dictionaries.en[key] || fallback || key;
    },
    [locale]
  );

  const isRTL = useMemo(() => !!LOCALES.find((l) => l.code === locale)?.rtl, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, isRTL }), [locale, setLocale, t, isRTL]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback when used outside provider
    return {
      locale: "en" as Locale,
      setLocale: () => {},
      t: (key: string, fallback?: string) => dictionaries.en[key] || fallback || key,
      isRTL: false,
    };
  }
  return ctx;
}
