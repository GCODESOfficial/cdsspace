"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/error/ErrorScreen";

/**
 * Route-level error boundary. Anything that throws while rendering a page
 * lands here and gets the CDS Space failure screen instead of a blank tab.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error);

    // A deploy replaces the hashed JS chunks. A tab that was open across the
    // deploy asks for a file that no longer exists, React unmounts the tree,
    // and the browser shows its own "page couldn't load" screen. Reloading
    // once fetches the new build; the flag stops it becoming a reload loop
    // when the failure is something else.
    const message = `${error?.name || ""} ${error?.message || ""}`;
    const staleChunk = /ChunkLoadError|Loading chunk|Importing a module script failed|dynamically imported module/i.test(message);
    if (!staleChunk || typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("cds.chunk-reload")) return;
      sessionStorage.setItem("cds.chunk-reload", "1");
      window.location.reload();
    } catch {
      /* private mode: fall through and just show the screen */
    }
  }, [error]);

  return (
    <ErrorScreen
      code="500"
      badge="Error 500"
      eyebrow="The trail washed out"
      title="Something broke here."
      titleAccent="Not your journey."
      body="This page ran into an unexpected problem on our side. Try again, or head home while we look into it."
      onRetry={reset}
    />
  );
}
