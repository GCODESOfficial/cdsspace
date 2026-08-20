import type { Metadata } from "next";
import { ClientBrandBriefWorkspace } from "@/components/dashboard/ClientBrandBriefWorkspace";

export const metadata: Metadata = {
  title: "Brand Identity Brief | CDS Space",
  description: "Create your client brand brief and manage private brand identity assets.",
};

export default function ClientBrandBriefPage() {
  return <ClientBrandBriefWorkspace />;
}
