/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import { fieldLabels } from "@/utils/questionLabels";

export default function SubmissionDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<any | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("id", id)
        .single();
      if (!error && data) setRow(data);
    };
    load();
  }, [id]);

  if (!row) return <p className="text-center text-gray-400">Loading...</p>;

  return (
    <div className="max-w-3xl mx-auto p-6 bg-[#151D48]">
      <h1 className="text-xl font-bold mb-6">
        {row.legal_name} - {row.role}
      </h1>
      <div className="space-y-4">
        {Object.entries(fieldLabels).map(([key, label]) => (
          <div key={key} className="flex gap-2">
            <span className="font-medium w-56">{label}:</span>
            <span>{row[key] ?? "-"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
