"use client";

import { useState } from "react";
import { MerchDashboard } from "@/components/dashboard/MerchDashboard";
import { MerchStudio } from "@/components/dashboard/MerchStudio";

export default function MerchPage() {
  const [studio, setStudio] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  if (studio) return <MerchStudio draftId={draftId} onBack={() => { setStudio(false); setDraftId(null); }} onComplete={() => { setStudio(false); setDraftId(null); }} />;
  return <MerchDashboard onCreateNew={() => { setDraftId(null); setStudio(true); }} onContinue={(id) => { setDraftId(id); setStudio(true); }} />;
}
