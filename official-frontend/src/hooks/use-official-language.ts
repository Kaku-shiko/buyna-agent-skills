import { useCallback, useEffect, useState } from "react";
import {
  defaultOfficialLanguage,
  getOfficialLanguageOption,
  getOfficialSiteContent,
  isOfficialLanguage,
  type OfficialLanguage,
} from "@/content/official-site";

const storageKey = "buyna-official-language";
const languageChangeEvent = "buyna:official-language-change";

function languageFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const value = params.get("lang");
  return isOfficialLanguage(value) ? value : null;
}

function languageFromNavigator() {
  if (typeof navigator === "undefined") return null;
  const preferred = navigator.language.toLowerCase();
  if (preferred.startsWith("ja")) return "ja";
  if (preferred.startsWith("en")) return "en";
  if (preferred.startsWith("zh")) return "zh";
  return null;
}

function readInitialLanguage(): OfficialLanguage {
  if (typeof window === "undefined") return defaultOfficialLanguage;

  const fromUrl = languageFromSearch(window.location.search);
  if (fromUrl) return fromUrl;

  const fromStorage = window.localStorage.getItem(storageKey);
  if (isOfficialLanguage(fromStorage)) return fromStorage;

  return languageFromNavigator() ?? defaultOfficialLanguage;
}

function applyDocumentLanguage(language: OfficialLanguage) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = getOfficialLanguageOption(language).htmlLang;
}

function writeLanguage(language: OfficialLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, language);

  const url = new URL(window.location.href);
  if (language === defaultOfficialLanguage) url.searchParams.delete("lang");
  else url.searchParams.set("lang", language);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

  applyDocumentLanguage(language);
  window.dispatchEvent(new CustomEvent(languageChangeEvent, { detail: language }));
}

export function useOfficialLanguage() {
  const [language, setLanguageState] = useState<OfficialLanguage>(defaultOfficialLanguage);

  useEffect(() => {
    const next = readInitialLanguage();
    setLanguageState(next);
    applyDocumentLanguage(next);

    function handleChange(event: Event) {
      const nextLanguage = (event as CustomEvent<OfficialLanguage>).detail;
      if (isOfficialLanguage(nextLanguage)) setLanguageState(nextLanguage);
    }

    function handlePopState() {
      const nextLanguage = readInitialLanguage();
      setLanguageState(nextLanguage);
      applyDocumentLanguage(nextLanguage);
    }

    window.addEventListener(languageChangeEvent, handleChange);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener(languageChangeEvent, handleChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const setLanguage = useCallback((next: OfficialLanguage) => {
    setLanguageState(next);
    writeLanguage(next);
  }, []);

  return {
    language,
    languageOption: getOfficialLanguageOption(language),
    setLanguage,
    content: getOfficialSiteContent(language),
  };
}
