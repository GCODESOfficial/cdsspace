import type { Metadata } from "next";
import ScreeningClient from "./ScreeningClient";

export const metadata: Metadata = {
  title: "Screening Portal · CDS Space",
  description:
    "Shortlisted candidate? Sign in to view your screening schedule and take your objective test.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ScreeningPage() {
  return <ScreeningClient />;
}
