"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/error/ErrorScreen";
import "./globals.css";

/**
 * Last line of defence. This catches failures in the root layout itself,
 * where app/error.tsx cannot help, and so has to supply its own html and body.
 * Without it Next serves an unstyled default page, which on mobile reads as
 * the browser's own "This page couldn't load" screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en" dir="ltr">
      <body className="font-sans antialiased">
        <ErrorScreen
          code="500"
          badge="Error 500"
          eyebrow="The trail washed out"
          title="Something broke here."
          titleAccent="Not your journey."
          body="This page ran into an unexpected problem on our side. Try again, or head home while we look into it."
          onRetry={reset}
        />
      </body>
    </html>
  );
}
