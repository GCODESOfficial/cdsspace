import type { Metadata } from "next";
import VaultUnlock from "./VaultUnlock";

// A shared vault item must never be indexed or previewed by a link scanner.
export const metadata: Metadata = {
  title: "Secure document | CDS Space",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function VaultSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VaultUnlock token={token} />;
}
