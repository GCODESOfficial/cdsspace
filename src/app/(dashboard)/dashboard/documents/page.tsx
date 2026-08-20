"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, FolderOpen, Link as LinkIcon, Loader2, ShieldCheck } from "lucide-react";

interface ClientDocument {
  id: string;
  title: string;
  description: string | null;
  kind: "cdoc" | "protected" | "link" | "delivery";
  created_at: string;
  resources: Array<{ id: string; label: string; url: string; source: "upload" | "google" }>;
}

export default function ClientDocumentsPage() {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/client/documents", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setDocuments(data.documents || []);
      else setError(data.error || "Documents are temporarily unavailable.");
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="mx-auto max-w-[1400px] p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight text-brand-navy lg:text-[34px]">My Documents</h1>
        <p className="mt-1 text-sm text-gray-500">Project files shared with your account.</p>
      </div>

      {loading ? (
        <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-blue" /></div>
      ) : error ? (
        <div className="rounded-[16px] border border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : documents.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-[16px] border border-white/70 bg-white/80 px-6 text-center shadow-[0_10px_40px_rgba(15,40,90,0.05)]">
          <div><FolderOpen className="mx-auto mb-3 h-10 w-10 text-brand-stroke" /><p className="text-sm text-gray-500">No documents have been shared with this account yet.</p></div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {documents.map((document) => {
            const Icon = document.kind === "protected" ? ShieldCheck : document.kind === "link" || document.kind === "delivery" ? LinkIcon : FileText;
            return (
              <article key={document.id} className="rounded-[16px] border border-white/70 bg-white/80 p-5 shadow-[0_10px_40px_rgba(15,40,90,0.05)] backdrop-blur-xl">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-[12px] bg-blue-50 text-brand-blue"><Icon className="h-5 w-5" /></div>
                  {document.resources[0] && <a href={document.resources[0].url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${document.title}`} className="grid h-9 w-9 place-items-center rounded-[8px] text-brand-mute transition hover:bg-blue-50 hover:text-brand-blue"><ExternalLink className="h-4 w-4" /></a>}
                </div>
                <h2 className="truncate text-sm font-semibold text-brand-navy" title={document.title}>{document.title}</h2>
                <p className="mt-1 line-clamp-2 min-h-9 text-xs leading-relaxed text-gray-500">{document.description || "Shared project document"}</p>
                {document.resources.length > 1 && (
                  <div className="mt-3 space-y-1.5">
                    {document.resources.map((resource) => (
                      <a key={resource.id} href={resource.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-lg border border-brand-stroke/20 bg-brand-bg/40 px-3 py-2 text-[11px] font-semibold text-brand-blue transition hover:border-blue-200 hover:bg-blue-50">
                        <span className="truncate">{resource.label}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-brand-stroke/10 pt-3 text-[11px] text-brand-mute">
                  <span className="capitalize">{document.kind === "cdoc" ? "cDoc" : document.kind === "delivery" ? "Design delivery" : document.kind}</span>
                  <span>{new Date(document.created_at).toLocaleDateString()}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
