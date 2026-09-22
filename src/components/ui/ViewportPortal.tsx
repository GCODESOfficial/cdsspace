"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders viewport UI outside clipped or transformed application shells.
 *
 * Fixed dialogs placed inside scrolling toolbars inherit their stacking and
 * clipping contexts. Portalling them to document.body keeps them centred on
 * the visible viewport and above persistent controls on every screen size.
 */
export function ViewportPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
