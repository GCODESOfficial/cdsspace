"use client";

import { useEffect } from "react";

/**
 * DOM-level auto-translator (ported from the cdslabs approach). When a language
 * other than English is selected it translates visible text AND user-facing
 * attributes (placeholders, titles, aria-labels, alt text, button values)
 * across the whole app - landing pages, dashboards, modals, chats,
 * notifications. Translations come from /api/translate (OpenAI, shared DB
 * cache); if that's unavailable it falls back to the free MyMemory API. Results
 * are cached in localStorage, a MutationObserver keeps new content translated,
 * and switching back to English restores the originals.
 */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "SVG", "PATH", "NOSCRIPT", "CANVAS"]);
// The accessibility widget IS translated (only its language dropdown opts out
// via data-no-translate), so it is intentionally not skipped here.
const SKIP_IDS = new Set<string>([]);
const ATTR_KEYS = ["placeholder", "title", "aria-label", "aria-placeholder", "alt", "data-text"] as const;
const VALUE_SELECTOR = 'input[type="button"][value], input[type="submit"][value], input[type="reset"][value]';
const CACHE_KEY = "cds.dom.translations";
const MIN_LEN = 2;
const BATCH_DELAY = 150;
const BATCH_SIZE = 30;
const MAX_BATCH_TEXT_CHARS = 12000;
const HAS_LETTER = /\p{L}/u;

type State = { source: string; translated: string; lang: string };

function shouldSkipElement(el: Element | null): boolean {
  if (!el) return true;
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.id && SKIP_IDS.has(el.id)) return true;
  return !!el.closest("[data-no-translate], [data-i18n-skip], [translate='no']");
}

function shouldTranslate(text: string): boolean {
  const t = text.trim();
  if (t.length < MIN_LEN || !HAS_LETTER.test(t)) return false;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return false;
  return true;
}

function preserveWhitespace(source: string, translated: string): string {
  const lead = source.match(/^\s*/)?.[0] || "";
  const trail = source.match(/\s*$/)?.[0] || "";
  return `${lead}${translated}${trail}`;
}

async function translateViaApp(texts: string[], target: string): Promise<string[] | null> {
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, source: "en", target }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.translations) ? data.translations : null;
  } catch {
    return null;
  }
}

async function translateViaMyMemory(texts: string[], target: string): Promise<string[]> {
  const out: string[] = [];
  for (const text of texts) {
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`en|${target}`)}`);
      const data = r.ok ? await r.json() : null;
      const t = data?.responseData?.translatedText;
      out.push(t && String(t).toLowerCase() !== text.toLowerCase() ? String(t) : text);
    } catch {
      out.push(text);
    }
  }
  return out;
}

async function translateBatch(texts: string[], target: string): Promise<string[]> {
  const app = await translateViaApp(texts, target);
  if (app && app.some((t, i) => t !== texts[i])) return app;
  return translateViaMyMemory(texts, target);
}

export function TranslationEngine() {
  useEffect(() => {
    let lang = localStorage.getItem("cds.lang") || "en";
    const textState = new WeakMap<Text, State>();
    const attrState = new WeakMap<Element, Map<string, State>>();
    const apiCache: Record<string, Record<string, string>> = (() => {
      try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
    })();
    const pending = new Set<string>();
    let inFlight = false;
    let observer: MutationObserver | null = null;
    let timer: number | null = null;

    const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(apiCache)); } catch { /* full */ } };

    const resolve = (source: string): string | null => {
      const cached = apiCache[lang]?.[source.trim()];
      if (cached) return cached;
      pending.add(source.trim());
      return null;
    };

    const applyText = (node: Text) => {
      if (shouldSkipElement(node.parentElement)) return;
      const current = node.textContent || "";
      if (!shouldTranslate(current)) return;
      const existing = textState.get(node);
      if (existing?.lang === lang && current === existing.translated) return;
      const source = existing && (current === existing.source || current === existing.translated) ? existing.source : current;
      if (!shouldTranslate(source)) return;
      const translated = resolve(source);
      if (!translated || translated === source.trim()) return;
      const next = preserveWhitespace(source, translated);
      node.textContent = next;
      textState.set(node, { source, translated: next, lang });
    };

    const applyAttr = (el: Element, attr: string) => {
      if (shouldSkipElement(el)) return;
      const current = el.getAttribute(attr) || "";
      if (!shouldTranslate(current)) return;
      let map = attrState.get(el);
      const existing = map?.get(attr);
      if (existing?.lang === lang && current === existing.translated) return;
      const source = existing && (current === existing.source || current === existing.translated) ? existing.source : current;
      if (!shouldTranslate(source)) return;
      const translated = resolve(source);
      if (!translated || translated === source.trim()) return;
      const next = preserveWhitespace(source, translated);
      el.setAttribute(attr, next);
      if (!map) { map = new Map(); attrState.set(el, map); }
      map.set(attr, { source, translated: next, lang });
    };

    const flush = () => {
      if (inFlight || pending.size === 0) return;
      const batch: string[] = [];
      let chars = 0;
      for (const text of pending) {
        if (batch.length >= BATCH_SIZE || chars + text.length > MAX_BATCH_TEXT_CHARS) break;
        pending.delete(text);
        batch.push(text);
        chars += text.length;
      }
      if (!batch.length) return;
      inFlight = true;
      const forLang = lang;
      translateBatch(batch, forLang).then((results) => {
        const cache = apiCache[forLang] || {};
        batch.forEach((text, i) => { if (results[i] && results[i] !== text) cache[text] = results[i]; });
        apiCache[forLang] = cache;
        saveCache();
      }).finally(() => {
        inFlight = false;
        if (lang === forLang) run();
      });
    };

    const run = () => {
      if (lang === "en") return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const el = node.parentElement;
          if (!el || SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          if ((node.textContent || "").trim().length < MIN_LEN) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      while (walker.nextNode()) applyText(walker.currentNode as Text);
      for (const attr of ATTR_KEYS) document.body.querySelectorAll(`[${attr}]`).forEach((el) => applyAttr(el, attr));
      document.body.querySelectorAll(VALUE_SELECTOR).forEach((el) => applyAttr(el, "value"));
      flush();
    };

    const restore = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n = walker.nextNode();
      while (n) {
        const st = textState.get(n as Text);
        if (st && (n as Text).textContent === st.translated) (n as Text).textContent = st.source;
        n = walker.nextNode();
      }
      for (const attr of [...ATTR_KEYS, "value"]) {
        document.body.querySelectorAll(`[${attr}]`).forEach((el) => {
          const st = attrState.get(el)?.get(attr);
          if (st && el.getAttribute(attr) === st.translated) el.setAttribute(attr, st.source);
        });
      }
    };

    const apply = (l: string) => {
      lang = l;
      document.documentElement.lang = l;
      const direction = l === "ar" ? "rtl" : "ltr";
      document.documentElement.dir = direction;
      document.documentElement.dataset.writingDirection = direction;
      if (l === "en") restore();
      else run();
    };

    observer = new MutationObserver(() => {
      if (lang === "en") return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(run, BATCH_DELAY);
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: [...ATTR_KEYS, "value"],
    });

    apply(lang);

    // First visit: auto-detect the visitor's language from their country and
    // translate into it. Manual choices (stored) always win.
    if (!localStorage.getItem("cds.lang")) {
      fetch("/api/geo").then((r) => (r.ok ? r.json() : null)).then((g) => {
        if (g?.locale && g.locale !== "en" && !localStorage.getItem("cds.lang")) {
          localStorage.setItem("cds.lang", g.locale);
          apply(g.locale);
          window.dispatchEvent(new CustomEvent("cds-language-location", { detail: g }));
          window.dispatchEvent(new CustomEvent("cds-lang-detected", { detail: g.locale }));
        }
      }).catch(() => {});
    }

    const onSetLang = (e: Event) => { localStorage.setItem("cds.lang", (e as CustomEvent).detail as string); apply((e as CustomEvent).detail as string); };
    window.addEventListener("cds-set-lang", onSetLang);
    return () => {
      window.removeEventListener("cds-set-lang", onSetLang);
      observer?.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
