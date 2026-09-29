"use client";

import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SelectOption = {
  index: number;
  value: string;
  label: string;
  group: string | null;
  disabled: boolean;
};

type Placement = {
  left: number;
  top: number;
  width: number;
  mobile: boolean;
};

const DASHBOARD_PATH = /^(?:\/admin(?:\/|$)|\/team(?:\/|$)|\/marketer(?:\/|$)|\/dashboard(?:\/|$)|\/[^/]+\/dashboard(?:\/|$))/;
const AUTH_PATH = /\/(?:login|invite|forgot-password|reset-password)(?:\/|$)/;

function isDashboardPath(pathname: string) {
  return DASHBOARD_PATH.test(pathname) && !AUTH_PATH.test(pathname);
}

function isEligibleSelect(element: Element | null): element is HTMLSelectElement {
  if (!(element instanceof HTMLSelectElement)) return false;
  if (element.disabled || element.multiple || element.size > 1) return false;
  if (element.dataset.searchable === "false" || element.closest("[data-native-select]")) return false;
  return true;
}

function readOptions(select: HTMLSelectElement): SelectOption[] {
  return Array.from(select.options).map((option) => ({
    index: option.index,
    value: option.value,
    label: option.label || option.textContent?.trim() || option.value,
    group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : null,
    disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
  }));
}

function fieldLabel(select: HTMLSelectElement) {
  if (select.getAttribute("aria-label")) return select.getAttribute("aria-label") as string;
  const explicitLabel = select.labels?.[0];
  if (explicitLabel?.textContent?.trim()) return explicitLabel.textContent.trim();
  const wrappingLabel = select.closest("label");
  return wrappingLabel?.childNodes[0]?.textContent?.trim() || select.name || "Select an option";
}

function getPlacement(select: HTMLSelectElement): Placement {
  const rect = select.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const mobile = viewportWidth < 640;

  if (mobile) {
    return { left: 12, top: 0, width: Math.max(0, viewportWidth - 24), mobile: true };
  }

  const width = Math.min(Math.max(rect.width, 280), viewportWidth - 24);
  const left = Math.min(Math.max(12, rect.left), viewportWidth - width - 12);
  const estimatedHeight = Math.min(390, Math.max(190, viewportHeight * 0.55));
  const fitsBelow = rect.bottom + estimatedHeight + 12 <= viewportHeight;
  const top = fitsBelow
    ? rect.bottom + 6
    : Math.max(12, rect.top - estimatedHeight - 6);

  return { left, top, width, mobile: false };
}

export function DashboardSearchableSelects() {
  const pathname = usePathname() || "";
  const [select, setSelect] = useState<HTMLSelectElement | null>(null);
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const pointerSelectRef = useRef<HTMLSelectElement | null>(null);
  const enabled = isDashboardPath(pathname);

  const close = useCallback((restoreFocus = true) => {
    const current = select;
    setSelect(null);
    setOptions([]);
    setQuery("");
    setPlacement(null);
    if (restoreFocus && current?.isConnected) {
      window.requestAnimationFrame(() => current.focus({ preventScroll: true }));
    }
  }, [select]);

  const open = useCallback((nextSelect: HTMLSelectElement) => {
    const nextOptions = readOptions(nextSelect);
    const selected = Math.max(0, nextOptions.findIndex((option) => option.index === nextSelect.selectedIndex));
    setSelect(nextSelect);
    setOptions(nextOptions);
    setPlacement(getPlacement(nextSelect));
    setActiveIndex(selected);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!select) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [select]);

  useEffect(() => {
    if (!enabled) {
      if (select) close(false);
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest("select") : null;
      if (!isEligibleSelect(target)) return;
      event.preventDefault();
      pointerSelectRef.current = target;
      open(target);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("select") : null;
      if (!isEligibleSelect(target)) return;
      // Pointer activation is handled earlier by pointerdown. Suppress the
      // follow-up native click without reopening the picker. A synthetic
      // click (detail 0) still covers keyboard activation and label forwarding.
      if (event.detail !== 0) {
        if (pointerSelectRef.current === target) event.preventDefault();
        pointerSelectRef.current = null;
        return;
      }
      event.preventDefault();
      open(target);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isEligibleSelect(event.target instanceof Element ? event.target : null)) return;
      if (!["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      open(event.target as HTMLSelectElement);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [close, enabled, open, select]);

  useEffect(() => {
    if (!select) return;
    const reposition = () => {
      if (!select.isConnected) close(false);
      else setPlacement(getPlacement(select));
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [close, select]);

  useEffect(() => {
    if (select) close(false);
    // The active native control belongs to the previous route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.label} ${option.group || ""}`.toLocaleLowerCase().includes(normalized),
    );
  }, [options, query]);

  useEffect(() => {
    if (activeIndex >= filteredOptions.length) setActiveIndex(0);
  }, [activeIndex, filteredOptions.length]);

  const choose = (option: SelectOption) => {
    if (!select || option.disabled) return;
    select.selectedIndex = option.index;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  };

  if (!enabled || !select || !placement || typeof document === "undefined") return null;

  const selectedValue = select.value;
  const label = fieldLabel(select);

  return createPortal(
    <div className="layer-popover fixed inset-0" data-dashboard-searchable-select>
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/10 sm:bg-transparent"
        aria-label="Close options"
        onClick={() => close()}
      />
      <div
        role="dialog"
        aria-label={label}
        className={placement.mobile
          ? "absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.25)]"
          : "absolute overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]"}
        style={placement.mobile ? undefined : { left: placement.left, top: placement.top, width: placement.width }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(filteredOptions.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter" && filteredOptions[activeIndex]) {
            event.preventDefault();
            choose(filteredOptions[activeIndex]);
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:hidden">
          <p className="min-w-0 truncate text-sm font-semibold text-[#0D1B39]">{label}</p>
          <button type="button" onClick={() => close()} className="ml-3 grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close options">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-2.5">
          <div className="flex h-11 items-center gap-2 rounded-xl border border-[#BFD0F3] bg-white px-3 focus-within:border-[#0A4FE8] focus-within:ring-2 focus-within:ring-[#0A4FE8]/10">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              placeholder="Search options..."
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0D1B39] outline-none placeholder:text-slate-400"
              autoComplete="off"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100" aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        <div role="listbox" className="max-h-[min(46vh,320px)] overflow-y-auto px-2.5 pb-2.5 overscroll-contain">
          {filteredOptions.length ? filteredOptions.map((option, index) => {
            const selected = option.value === selectedValue && option.index === select.selectedIndex;
            const showGroup = option.group && option.group !== filteredOptions[index - 1]?.group;
            return (
              <div key={`${option.index}-${option.value}`}>
                {showGroup ? <p className="px-3 pb-1 pt-3 text-[11px] font-semibold text-slate-400">{option.group}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={`flex min-h-10 w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "bg-[#0A4FE8] font-medium text-white"
                      : index === activeIndex
                        ? "bg-[#EDF3FF] text-[#0D1B39]"
                        : "text-slate-700 hover:bg-slate-50"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </button>
              </div>
            );
          }) : (
            <div className="px-3 py-8 text-center text-sm text-slate-500">No matching options found.</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
