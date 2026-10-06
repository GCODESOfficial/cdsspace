"use client";

 

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Download, Link2, History, Stamp, PenLine, Sun, Moon, Trash2, Archive, Check, Loader2, MessagesSquare } from "lucide-react";
import { ShareInChatModal } from "@/components/chat/ShareInChatModal";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";
import { RichDocEditor } from "@/components/cdocs/rich-doc-editor";

interface Doc {
  id: string;
  title: string;
  body: string;
  theme: "light" | "dark";
  stamped: boolean;
  archived: boolean;
  share_token: string;
  last_saved_at: string;
}

interface ActivityEntry {
  id: string;
  action: string;
  detail: string | null;
  actor_name: string | null;
  actor_is_admin: boolean;
  created_at: string;
}

export default function CDocEditor() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [doc, setDoc] = useState<Doc | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [stamped, setStamped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareChat, setShareChat] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const r = await fetch(`/api/cdocs/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        setDoc(j.doc);
        setTitle(j.doc.title);
        setBody(j.doc.body || "");
        setTheme(j.doc.theme);
        setStamped(j.doc.stamped);
        setSavedAt(j.doc.last_saved_at);
      }
    })();
  }, [id]);

  const save = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    const r = await fetch(`/api/cdocs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, theme, stamped }),
    });
    const j = await r.json();
    setSaving(false);
    if (j.ok) setSavedAt(j.doc.last_saved_at);
  }, [id, title, body, theme, stamped]);

  // Autosave (debounced)
  useEffect(() => {
    if (!doc) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, theme, stamped]);

  async function loadActivity() {
    const r = await fetch(`/api/cdocs/${id}/activity`, { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setActivity(j.activity);
  }

  function copyShareLink() {
    if (!doc) return;
    navigator.clipboard.writeText(`${window.location.origin}/cdocs/${doc.share_token}`);
  }

  async function download() {
    if (!doc) return;
    const { exportCDocToPdf } = await import("@/lib/cdocs-pdf");
    exportCDocToPdf({
      title,
      body,
      theme,
      stamped,
      shareUrl: `${window.location.origin}/cdocs/${doc.share_token}`,
    });
  }

  async function archive() {
    if (!(await appConfirm("Archive this document?"))) return;
    await fetch(`/api/cdocs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    router.push("/team/cdocs");
  }

  async function remove() {
    if (!(await appConfirm("Delete this document? This cannot be undone."))) return;
    const r = await fetch(`/api/cdocs/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      appAlert(j.error || "Couldn't delete");
      return;
    }
    router.push("/team/cdocs");
  }

  function sendToCSign() {
    router.push(`/team/csign?doc=${id}`);
  }

  if (!doc) return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></div>;

  const isDark = theme === "dark";
  return (
    <div className={`min-h-screen ${isDark ? "bg-[#0D1B39] text-white" : "bg-[#f5f7fb] text-[#0D1B39]"}`}>
      <header className="sticky top-0 z-10 px-4 md:px-8 py-3 border-b flex items-center gap-3"
        style={isDark ? { background: "#10225A", borderColor: "rgba(255,255,255,0.08)" } : { background: "white", borderColor: "#f0f2f7" }}>
        <Link href="/team/cdocs" className="p-2 rounded-lg hover:bg-gray-100/10">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`flex-1 min-w-0 bg-transparent text-[15px] font-semibold focus:outline-none ${isDark ? "text-white" : "text-[#0D1B39]"}`}
          placeholder="Untitled"
        />
        <div className="text-[11px] opacity-60 hidden md:block">
          {saving ? "Saving…" : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : ""}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="p-2 rounded-lg hover:bg-gray-100/10" title="Toggle theme">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => setStamped(!stamped)} className={`p-2 rounded-lg hover:bg-gray-100/10 ${stamped ? "text-[#0A4FE8]" : ""}`} title="Toggle CDS Space stamp">
            <Stamp className="w-4 h-4" />
          </button>
          <button onClick={() => setShareChat(true)} className="p-2 rounded-lg hover:bg-gray-100/10 text-[#0A4FE8]" title="Share in chat">
            <MessagesSquare className="w-4 h-4" />
          </button>
          <button onClick={copyShareLink} className="p-2 rounded-lg hover:bg-gray-100/10" title="Copy share link">
            <Link2 className="w-4 h-4" />
          </button>
          <button onClick={() => { setShowActivity(true); loadActivity(); }} className="p-2 rounded-lg hover:bg-gray-100/10" title="Activity">
            <History className="w-4 h-4" />
          </button>
          <button onClick={sendToCSign} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0A4FE8]/40 text-[#0A4FE8] text-[12px] font-medium hover:bg-blue-50">
            <PenLine className="w-3.5 h-3.5" /> Send to cSign
          </button>
          <button onClick={download} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A4FE8] text-white text-[12px] font-medium hover:bg-[#083EC0]">
            <Download className="w-3.5 h-3.5" /> Download PDF
          </button>
          <button onClick={save} className="inline-flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-100/10" title="Save now">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </button>
          <div className="w-px h-6 bg-gray-200/40 mx-1" />
          <button onClick={archive} className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50" title="Archive">
            <Archive className="w-4 h-4" />
          </button>
          <button onClick={remove} className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-[860px] mx-auto p-6 md:p-10">
        <RichDocEditor
          value={body}
          onChange={setBody}
          theme={theme}
          placeholder="Start writing…"
        />
        <p className="text-[11px] mt-6 opacity-50">
          Exports as a branded PDF with the CDS Space header, date/time and page numbers. Toggle the stamp icon to add a circular CDS Space seal.
          Format with the toolbar: bold, italic, underline, headings, colors, font size, alignment, lists, quotes, links, and inline images (click an image to resize).
        </p>
      </main>

      {showActivity && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowActivity(false)}>
          <div className="bg-white text-[#0D1B39] rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="text-[14px] font-semibold">Activity</h3></div>
            <div className="flex-1 overflow-y-auto p-4">
              {activity.length === 0 ? (
                <p className="text-center text-[12px] text-gray-400 py-6">No activity yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-2.5 text-[12px]">
                      <div className="w-6 h-6 rounded-full bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center text-[10px] font-bold shrink-0">
                        <Check className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#0D1B39]">
                          <span className="font-semibold">{a.actor_name || (a.actor_is_admin ? "Admin" : "Member")}</span> {a.action}
                          {a.detail ? <> - <span className="italic text-gray-500">{a.detail}</span></> : null}
                        </p>
                        <p className="text-[10.5px] text-gray-400">{new Date(a.created_at).toLocaleString()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <ShareInChatModal
        open={shareChat}
        onClose={() => setShareChat(false)}
        shareText={doc ? `${title || "Document"}: ${window.location.origin}/cdocs/${doc.share_token}` : ""}
        title={`Document · ${title || "Untitled"}`}
      />
    </div>
  );
}
