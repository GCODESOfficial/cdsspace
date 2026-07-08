"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { parseCDocBody } from "@/lib/cdocs-markdown";
import { isHtmlBody, sanitizeCDocHtml } from "@/lib/cdocs-html";

interface PublicDoc {
  id: string;
  title: string;
  body: string;
  theme: "light" | "dark";
  stamped: boolean;
  share_token: string;
  last_saved_at: string;
}

export default function CDocPublicPage() {
  const params = useParams<{ token: string }>();
  const [doc, setDoc] = useState<PublicDoc | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!params?.token) return;
    (async () => {
      const r = await fetch(`/api/cdocs/public/${params.token}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) setNotFound(true);
      else setDoc(j.doc);
    })();
  }, [params?.token]);

  if (notFound) return <div className="min-h-screen flex items-center justify-center text-gray-500">Document not found.</div>;
  if (!doc) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></div>;

  const isDark = doc.theme === "dark";
  const bodyIsHtml = isHtmlBody(doc.body);
  const blocks = bodyIsHtml ? [] : parseCDocBody(doc.body || "");
  const safeHtml = bodyIsHtml ? sanitizeCDocHtml(doc.body) : "";

  async function download() {
    const { exportCDocToPdf } = await import("@/lib/cdocs-pdf");
    exportCDocToPdf({ title: doc!.title, body: doc!.body, theme: doc!.theme, stamped: doc!.stamped, shareUrl: window.location.href });
  }

  return (
    <div className={`min-h-screen ${isDark ? "bg-[#0D1B39] text-white" : "bg-white text-[#0D1B39]"}`}>
      <header className={`px-6 py-4 border-b ${isDark ? "border-white/10" : "border-gray-100"} flex items-center justify-between`}>
        <div>
          <p className={`text-[11px] uppercase tracking-[0.2em] ${isDark ? "text-white/60" : "text-gray-400"}`}>CDS Space · cDocs</p>
          <h1 className="text-[18px] font-bold mt-0.5">{doc.title}</h1>
        </div>
        <button onClick={download} className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0A4FE8] text-white text-[12.5px] font-medium rounded-xl hover:bg-[#083EC0]">
          <Download className="w-4 h-4" /> Download PDF
        </button>
      </header>
      <main className="max-w-[760px] mx-auto p-6 md:p-10">
        {bodyIsHtml ? (
          <article
            className="cdocs-public max-w-none text-[14.5px] leading-[1.75]"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <article className="prose prose-sm md:prose-base max-w-none">
            {blocks.map((block, i) => {
              if (block.kind === "blank") return <div key={i} style={{ height: "0.6em" }} />;
              const text = block.spans.map((s) => s.text).join("");
              if (block.kind === "h1") return <h1 key={i} style={{ fontWeight: 700, fontSize: "1.6rem", marginTop: "1.1em" }}>{text}</h1>;
              if (block.kind === "h2") return <h2 key={i} style={{ fontWeight: 600, fontSize: "1.2rem", marginTop: "1em" }}>{text}</h2>;
              if (block.kind === "bullet") return <li key={i} style={{ marginLeft: "1.2em" }}>{text}</li>;
              return (
                <p key={i}>
                  {block.spans.map((s, j) => {
                    const style: React.CSSProperties = {};
                    if (s.type === "bold") style.fontWeight = 700;
                    if (s.type === "underline") style.textDecoration = "underline";
                    return <span key={j} style={style}>{s.text}</span>;
                  })}
                </p>
              );
            })}
          </article>
        )}
        <style jsx global>{`
          .cdocs-public h1 { font-size: 1.8rem; font-weight: 700; margin: 1rem 0 0.5rem; }
          .cdocs-public h2 { font-size: 1.4rem; font-weight: 700; margin: 0.9rem 0 0.4rem; }
          .cdocs-public h3 { font-size: 1.15rem; font-weight: 600; margin: 0.8rem 0 0.3rem; }
          .cdocs-public p { margin: 0.35rem 0; }
          .cdocs-public ul, .cdocs-public ol { padding-left: 1.4rem; margin: 0.5rem 0; }
          .cdocs-public li { margin: 0.2rem 0; }
          .cdocs-public a { color: #0A4FE8; text-decoration: underline; }
          .cdocs-public blockquote { border-left: 3px solid #0A4FE8; padding-left: 0.9rem; margin: 0.6rem 0; color: #4B5563; }
          .cdocs-public pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #F3F4F8; padding: 0.5rem 0.7rem; border-radius: 8px; font-size: 0.9rem; }
          .cdocs-public hr { border: 0; border-top: 1px solid #E5E7EB; margin: 1rem 0; }
          .cdocs-public img { max-width: 100%; border-radius: 6px; }
        `}</style>
        <p className="mt-10 text-[11px] opacity-50">Last edited {new Date(doc.last_saved_at).toLocaleString()} · cdsspace.pro/cdocs/{doc.share_token}</p>
      </main>
    </div>
  );
}
