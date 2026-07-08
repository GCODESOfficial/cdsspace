"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Loader2, ArrowLeft, Eye, Search, Users2, X,
  FileText, Send, CalendarClock, EyeOff, Archive, Sparkles,
} from "lucide-react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { AssetUrlField } from "@/components/admin/AssetUrlField";
import { appAlert, appConfirm, appToast } from "@/lib/app-notify";
import { BLOG_CATEGORIES, slugify, type BlogStatus } from "@/lib/blog/constants";

interface Author { id: string; name: string; photo_url: string | null; position: string | null; bio: string | null; social_links: Record<string, string>; }
interface Post {
  id: string; slug: string; title: string; subtitle: string | null; excerpt: string | null;
  cover_url: string | null; category: string; tags: string[]; content: string; series: string | null;
  seo_title: string | null; seo_description: string | null; author_id: string | null; author_name: string | null;
  status: BlogStatus; published_at: string | null; reading_time: number; views: number;
  likes_count: number; dislikes_count: number; sharing_enabled: boolean; reactions_enabled: boolean;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-600", icon: FileText },
  scheduled: { label: "Scheduled", cls: "bg-amber-50 text-amber-700", icon: CalendarClock },
  published: { label: "Published", cls: "bg-emerald-50 text-emerald-700", icon: Send },
  hidden: { label: "Hidden", cls: "bg-purple-50 text-purple-600", icon: EyeOff },
  archived: { label: "Archived", cls: "bg-gray-100 text-gray-500", icon: Archive },
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(local: string) {
  return local ? new Date(local).toISOString() : null;
}

const EMPTY = {
  id: "", title: "", slug: "", subtitle: "", excerpt: "", cover_url: "", category: "Branding",
  tags: "", content: "", series: "", seo_title: "", seo_description: "", author_id: "",
  status: "draft" as BlogStatus, published_at: "", sharing_enabled: true, reactions_enabled: true,
};

export default function BlogManagerPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "editor">("list");
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [authorsOpen, setAuthorsOpen] = useState(false);

  const loadPosts = useCallback(async () => {
    const res = await fetch("/api/admin/blog", { credentials: "include", cache: "no-store" });
    const json = await res.json();
    if (json.ok) setPosts(json.posts);
    setLoading(false);
  }, []);
  const loadAuthors = useCallback(async () => {
    const res = await fetch("/api/admin/blog/authors", { credentials: "include", cache: "no-store" });
    const json = await res.json();
    if (json.ok) setAuthors(json.authors);
  }, []);

  useEffect(() => { loadPosts(); loadAuthors(); }, [loadPosts, loadAuthors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => !q || p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.author_name || "").toLowerCase().includes(q));
  }, [posts, search]);

  function newPost() { setForm({ ...EMPTY }); setView("editor"); }
  function editPost(p: Post) {
    setForm({
      id: p.id, title: p.title, slug: p.slug, subtitle: p.subtitle || "", excerpt: p.excerpt || "",
      cover_url: p.cover_url || "", category: p.category, tags: (p.tags || []).join(", "), content: p.content || "",
      series: p.series || "", seo_title: p.seo_title || "", seo_description: p.seo_description || "",
      author_id: p.author_id || "", status: p.status, published_at: toLocalInput(p.published_at),
      sharing_enabled: p.sharing_enabled, reactions_enabled: p.reactions_enabled,
    });
    setView("editor");
  }

  async function save(statusOverride?: BlogStatus) {
    if (!form.title.trim()) { appAlert("Title is required."); return; }
    const status = statusOverride || form.status;
    if (status === "scheduled" && !form.published_at) { appAlert("Pick a publish date & time to schedule."); return; }
    setSaving(true);
    const payload = {
      ...(form.id ? { id: form.id } : {}),
      title: form.title.trim(), slug: form.slug.trim() || undefined, subtitle: form.subtitle || null,
      excerpt: form.excerpt || null, cover_url: form.cover_url || null, category: form.category,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), content: form.content,
      series: form.series || null, seo_title: form.seo_title || null, seo_description: form.seo_description || null,
      author_id: form.author_id || null, status, published_at: fromLocalInput(form.published_at),
      sharing_enabled: form.sharing_enabled, reactions_enabled: form.reactions_enabled,
    };
    try {
      const res = await fetch("/api/admin/blog", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not save");
      appToast(status === "published" ? "Published" : status === "scheduled" ? "Scheduled" : "Saved");
      await loadPosts();
      setView("list");
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Post) {
    if (!(await appConfirm(`Delete "${p.title}"? This cannot be undone.`))) return;
    const res = await fetch(`/api/admin/blog?id=${p.id}`, { method: "DELETE", credentials: "include" });
    const json = await res.json();
    if (json.ok) { appToast("Deleted"); loadPosts(); }
    else appAlert(json.error || "Could not delete");
  }

  async function aiFill() {
    if (!form.title.trim()) { appAlert("Add an article title first - the AI writes everything else from it."); return; }
    if (form.content.trim() && !(await appConfirm("Replace the current draft with an AI-generated version?"))) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/admin/blog/ai", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ title: form.title, category: form.category }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "AI request failed");
      const r = json.result;
      setForm((f) => ({
        ...f,
        slug: f.slug.trim() || r.slug,
        subtitle: r.subtitle || f.subtitle,
        excerpt: r.excerpt || f.excerpt,
        content: r.content || f.content,
        seo_title: r.seo_title || f.seo_title,
        seo_description: r.seo_description || f.seo_description,
        tags: r.tags?.length ? r.tags.join(", ") : f.tags,
      }));
      appToast("AI filled the fields - review and edit before publishing.");
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setAiBusy(false);
    }
  }

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  /* ---------- Editor view ---------- */
  if (view === "editor") {
    const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-gray-500">{label}</label>
        {children}
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
    );
    const input = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300";

    return (
      <div className="p-6 md:p-8 max-w-[1100px]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button onClick={() => setView("list")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0A4FE8]">
            <ArrowLeft className="w-4 h-4" /> Back to posts
          </button>
          <button onClick={aiFill} disabled={aiBusy} title="Generate everything except the title with AI"
            className="inline-flex items-center gap-2 rounded-xl border border-[#0A4FE8]/30 bg-blue-50 px-4 py-2 text-sm font-semibold text-[#0A4FE8] transition hover:bg-blue-100 disabled:opacity-60">
            {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiBusy ? "Writing…" : "AI fill"}
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main */}
          <div className="space-y-5">
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Article title"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[22px] font-bold text-[#0D1B39] outline-none focus:border-blue-300" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Slug" hint="Auto-generated from the title if left blank.">
                <input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder={slugify(form.title) || "article-slug"} className={input} />
              </Field>
              <Field label="Subtitle (optional)">
                <input value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} className={input} />
              </Field>
            </div>
            <Field label="Excerpt" hint="Short summary shown on cards and in social previews.">
              <textarea value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} rows={2} className={`${input} resize-none`} />
            </Field>
            <Field label="Content">
              <RichTextEditor value={form.content} onChange={(html) => set("content", html)} placeholder="Write your article…" />
            </Field>
            <div className="rounded-2xl border border-gray-100 bg-white p-5">
              <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-gray-400">SEO</p>
              <div className="space-y-4">
                <Field label="SEO title"><input value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} className={input} /></Field>
                <Field label="SEO description"><textarea value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} rows={2} className={`${input} resize-none`} /></Field>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
              <Field label="Status">
                <select value={form.status} onChange={(e) => set("status", e.target.value as BlogStatus)} className={input}>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              {(form.status === "scheduled" || form.status === "published") && (
                <Field label={form.status === "scheduled" ? "Publish at" : "Published at"}>
                  <input type="datetime-local" value={form.published_at} onChange={(e) => set("published_at", e.target.value)} className={input} />
                </Field>
              )}
              <div className="flex flex-col gap-2 pt-1">
                <button onClick={() => save("published")} disabled={saving}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-200 disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publish now
                </button>
                <button onClick={() => save()} disabled={saving}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:border-[#0A4FE8] hover:text-[#0A4FE8]">
                  Save {form.status === "scheduled" ? "& schedule" : "as " + form.status}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
              <Field label="Category">
                <select value={form.category} onChange={(e) => set("category", e.target.value)} className={input}>
                  {BLOG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Author">
                <select value={form.author_id} onChange={(e) => set("author_id", e.target.value)} className={input}>
                  <option value="">- No author -</option>
                  {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Series (optional)"><input value={form.series} onChange={(e) => set("series", e.target.value)} placeholder="e.g. Brand Audit Series" className={input} /></Field>
              <Field label="Tags" hint="Comma-separated."><input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="branding, startups" className={input} /></Field>
              <Field label="Cover banner" hint="1920×1080 recommended. Upload PNG/JPG or paste a URL.">
                <AssetUrlField value={form.cover_url} onChange={(url) => set("cover_url", url)} placeholder="https://…" accept="image" folder="blog/covers" />
              </Field>
              {form.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.cover_url} alt="cover" className="aspect-[16/9] w-full rounded-xl object-cover" />
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3">
              <label className="flex items-center justify-between text-sm font-medium text-gray-600">
                Sharing enabled
                <input type="checkbox" checked={form.sharing_enabled} onChange={(e) => set("sharing_enabled", e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#0A4FE8]" />
              </label>
              <label className="flex items-center justify-between text-sm font-medium text-gray-600">
                Reactions enabled
                <input type="checkbox" checked={form.reactions_enabled} onChange={(e) => set("reactions_enabled", e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#0A4FE8]" />
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- List view ---------- */
  return (
    <div className="p-6 md:p-8 max-w-[1280px]">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Content</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Blog Manager</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAuthorsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:border-[#0A4FE8] hover:text-[#0A4FE8]">
            <Users2 className="w-4 h-4" /> Authors
          </button>
          <button onClick={newPost} className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-200">
            <Plus className="w-4 h-4" /> New Article
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posts…"
              className="pl-9 pr-4 py-2 w-full rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#0A4FE8]" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No articles yet. Create your first one.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="py-2.5 px-6 font-semibold">Title</th>
                <th className="px-3 font-semibold">Category</th>
                <th className="px-3 font-semibold">Author</th>
                <th className="px-3 font-semibold">Status</th>
                <th className="px-3 font-semibold">Views</th>
                <th className="px-6 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const meta = STATUS_META[p.status] || STATUS_META.draft;
                const Icon = meta.icon;
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition">
                    <td className="py-3 px-6">
                      <p className="text-[13px] font-semibold text-[#0D1B39]">{p.title}</p>
                      <p className="text-[11px] text-gray-400">/blog/{p.slug} · {p.reading_time} min</p>
                    </td>
                    <td className="px-3"><span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-[#0A4FE8]">{p.category}</span></td>
                    <td className="px-3 text-[13px] text-gray-500">{p.author_name || "-"}</td>
                    <td className="px-3"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}><Icon className="w-3 h-3" />{meta.label}</span></td>
                    <td className="px-3 text-[13px] text-gray-500">{p.views}</td>
                    <td className="px-6">
                      <div className="flex items-center justify-end gap-1">
                        {p.status === "published" && (
                          <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50" title="View live"><Eye className="w-4 h-4" /></a>
                        )}
                        <button onClick={() => editPost(p)} className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50" title="Edit"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => remove(p)} className="p-1.5 rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {authorsOpen && <AuthorsModal authors={authors} onClose={() => setAuthorsOpen(false)} onChanged={loadAuthors} />}
    </div>
  );
}

/* ---------- Authors modal ---------- */

function AuthorsModal({ authors, onClose, onChanged }: { authors: Author[]; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState<Partial<Author> | null>(null);
  const input = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100";

  async function save() {
    if (!editing?.name?.trim()) { appAlert("Name is required."); return; }
    const method = editing.id ? "PATCH" : "POST";
    const res = await fetch("/api/admin/blog/authors", {
      method, headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify(editing),
    });
    const json = await res.json();
    if (json.ok) { appToast("Saved"); setEditing(null); onChanged(); }
    else appAlert(json.error || "Could not save");
  }
  async function remove(id: string) {
    if (!(await appConfirm("Delete this author?"))) return;
    const res = await fetch(`/api/admin/blog/authors?id=${id}`, { method: "DELETE", credentials: "include" });
    const json = await res.json();
    if (json.ok) { appToast("Deleted"); onChanged(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-[#0D1B39]">Authors</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          {editing ? (
            <div className="space-y-3">
              <input placeholder="Name" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={input} />
              <input placeholder="Position" value={editing.position || ""} onChange={(e) => setEditing({ ...editing, position: e.target.value })} className={input} />
              <AssetUrlField placeholder="Photo URL" value={editing.photo_url || ""} onChange={(url) => setEditing({ ...editing, photo_url: url })} accept="image" folder="blog/authors" />
              <textarea placeholder="Bio" rows={3} value={editing.bio || ""} onChange={(e) => setEditing({ ...editing, bio: e.target.value })} className={`${input} resize-none`} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500">Cancel</button>
                <button onClick={save} className="rounded-xl bg-[#0A4FE8] px-4 py-2 text-sm font-semibold text-white">Save</button>
              </div>
            </div>
          ) : (
            <>
              <button onClick={() => setEditing({ name: "" })} className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-[#0A4FE8]">
                <Plus className="w-4 h-4" /> Add author
              </button>
              <div className="space-y-2">
                {authors.length === 0 && <p className="text-sm text-gray-400">No authors yet.</p>}
                {authors.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-[#0D1B39]">{a.name}</p>
                      {a.position && <p className="text-[11px] text-gray-400">{a.position}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(a)} className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(a.id)} className="p-1.5 rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
