"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, ChevronLeft, ChevronRight, Eye, FileCheck2, FileSearch, Heart,
  Loader2, Pencil, Plus, Save, Search, ShieldCheck, Trash2, Upload, X,
} from "lucide-react";
import { AssetUrlField } from "@/components/admin/AssetUrlField";
import { appAlert, appConfirm, appToast } from "@/lib/app-notify";
import {
  BLOG_STATUSES, INTELLIGENCE_ACCESS_LEVELS,
  INTELLIGENCE_PDF_ACCESS, INTELLIGENCE_PUBLICATION_TYPES, slugify, type BlogStatus,
} from "@/lib/blog/constants";

type Post = Record<string, any> & { id: string; title: string; slug: string; status: BlogStatus; publication_type: string; category: string; views: number; updated_at: string };
type Author = { id: string; name: string; photo_url?: string; position?: string; bio?: string; role?: string; expertise?: string[]; contributor_type?: string; is_active?: boolean; is_external?: boolean; organization?: string; profile_url?: string };
export type IntelligenceModuleView = "overview" | "all" | "create" | "reports" | "audits" | "benchmarks" | "briefs" | "cases" | "private" | "comments" | "analytics" | "authors" | "categories" | "tags" | "settings" | "archive";

type ModuleView = IntelligenceModuleView;

const MODULE_ROUTES: Record<ModuleView, string> = {
  overview: "/admin/intelligence",
  all: "/admin/intelligence/library",
  create: "/admin/intelligence/create",
  reports: "/admin/intelligence/library?type=reports",
  audits: "/admin/intelligence/library?type=audits",
  benchmarks: "/admin/intelligence/library?type=benchmarks",
  briefs: "/admin/intelligence/library?type=briefs",
  cases: "/admin/intelligence/library?type=cases",
  private: "/admin/intelligence/private",
  comments: "/admin/intelligence/comments",
  analytics: "/admin/intelligence/analytics",
  authors: "/admin/intelligence/authors",
  categories: "/admin/intelligence/taxonomy",
  tags: "/admin/intelligence/taxonomy",
  settings: "/admin/intelligence/settings",
  archive: "/admin/intelligence/archive",
};

const PUBLICATION_FILTERS: Array<{ key: ModuleView; label: string }> = [
  { key: "all", label: "All" },
  { key: "reports", label: "Reports" },
  { key: "audits", label: "Brand Audits" },
  { key: "benchmarks", label: "Benchmarks" },
  { key: "briefs", label: "Executive Briefs" },
  { key: "cases", label: "Case Studies" },
];

const WIZARD_STEPS = ["Type & details", "PDF & access", "Review & publish"];
const input = "h-11 w-full rounded-[8px] border border-[#DDE5F4] bg-white px-3 text-[12px] text-[#07123F] outline-none transition focus:border-[#075BE5] focus:ring-2 focus:ring-blue-100";
const textarea = `${input} h-auto min-h-24 py-3 resize-y`;

type ContextField = { key: "company_analysed" | "industry" | "country"; label: string; placeholder: string };
type PublicationPattern = { category: string; summaryLabel: string; summaryPlaceholder: string; fields: ContextField[]; privateByDefault?: boolean };

const PUBLICATION_PATTERNS: Record<string, PublicationPattern> = {
  "Brand Intelligence Report": { category: "Brand Research", summaryLabel: "Report overview", summaryPlaceholder: "What will the reader learn?", fields: [{ key: "company_analysed", label: "Brand or company", placeholder: "Brand covered" }, { key: "industry", label: "Industry", placeholder: "Industry" }] },
  "Public Brand Audit": { category: "Brand Audits", summaryLabel: "Audit snapshot", summaryPlaceholder: "The key issue and finding in two sentences.", fields: [{ key: "company_analysed", label: "Brand audited", placeholder: "Brand name" }, { key: "country", label: "Market", placeholder: "Country or region" }] },
  "Industry Benchmark": { category: "Industry Benchmarks", summaryLabel: "Benchmark overview", summaryPlaceholder: "What is being compared?", fields: [{ key: "industry", label: "Industry", placeholder: "Industry benchmarked" }, { key: "country", label: "Market", placeholder: "Country or region" }] },
  "Industry Brand Scorecard": { category: "Industry Benchmarks", summaryLabel: "Scorecard overview", summaryPlaceholder: "What does the scorecard measure?", fields: [{ key: "company_analysed", label: "Brand scored", placeholder: "Brand name" }, { key: "industry", label: "Industry", placeholder: "Industry" }] },
  "Market Entry Brief": { category: "Market Intelligence", summaryLabel: "Entry brief", summaryPlaceholder: "The opportunity or risk in two sentences.", fields: [{ key: "country", label: "Target market", placeholder: "Country or region" }, { key: "industry", label: "Industry", placeholder: "Industry" }] },
  "Customer Experience Review": { category: "Customer Experience", summaryLabel: "Review snapshot", summaryPlaceholder: "The experience reviewed and main finding.", fields: [{ key: "company_analysed", label: "Brand reviewed", placeholder: "Brand name" }, { key: "country", label: "Market", placeholder: "Country or region" }] },
  "Digital Readiness Assessment": { category: "Digital Readiness", summaryLabel: "Assessment snapshot", summaryPlaceholder: "The readiness level and main gap.", fields: [{ key: "company_analysed", label: "Organisation assessed", placeholder: "Organisation" }, { key: "industry", label: "Industry", placeholder: "Industry" }] },
  "Executive Insight": { category: "Executive Insights", summaryLabel: "Insight summary", summaryPlaceholder: "The central idea in two sentences.", fields: [{ key: "industry", label: "Industry", placeholder: "Optional" }, { key: "country", label: "Market", placeholder: "Optional" }] },
  "Case Study": { category: "Case Studies", summaryLabel: "Case summary", summaryPlaceholder: "The challenge, action and result in two sentences.", fields: [{ key: "company_analysed", label: "Brand or company", placeholder: "Case-study subject" }, { key: "industry", label: "Industry", placeholder: "Industry" }] },
  "Research Note": { category: "Brand Research", summaryLabel: "Research note", summaryPlaceholder: "The observation and why it matters.", fields: [{ key: "industry", label: "Industry", placeholder: "Optional" }, { key: "country", label: "Market", placeholder: "Optional" }] },
  "Executive Research Brief": { category: "Executive Insights", summaryLabel: "Brief summary", summaryPlaceholder: "The decision this brief supports.", fields: [{ key: "industry", label: "Industry", placeholder: "Optional" }, { key: "country", label: "Market", placeholder: "Optional" }] },
  "Private Brand Infrastructure Assessment": { category: "Brand Audits", summaryLabel: "Assessment summary", summaryPlaceholder: "A short private summary for the client.", fields: [{ key: "company_analysed", label: "Client or brand", placeholder: "Client name" }, { key: "industry", label: "Industry", placeholder: "Industry" }], privateByDefault: true },
};

function publicationPattern(type: string) {
  return PUBLICATION_PATTERNS[type] || PUBLICATION_PATTERNS["Executive Insight"];
}

function emptyForm() {
  return {
    id: "", publication_type: "Brand Intelligence Report", title: "", slug: "", subtitle: "", excerpt: "",
    category: "Brand Research", author_id: "", tags: "", series: "", country: "", city: "", industry: "", company_analysed: "",
    cover_url: "", video_url: "", pdf_storage_path: "", pdf_display_name: "", pdf_page_count: "", pdf_access_mode: "view", original_source_url: "",
    content: "", executive_summary: "", comments_enabled: true, replies_enabled: true, reactions_enabled: true, sharing_enabled: true,
    view_count_enabled: true, downloads_enabled: false, printing_enabled: false,
    cta_type: "none", cta_text: "", cta_url: "", cta_supporting_line: "",
    seo_title: "", seo_description: "", focus_keywords: "", social_title: "", social_description: "", social_image_url: "", canonical_url: "",
    access_level: "public", assigned_client_id: "", access_expires_at: "", internal_notes: "", featured: false,
    status: "draft" as BlogStatus, published_at: "", ai_assisted: false, approval_status: "not_requested", report_status: "not_acknowledged",
  };
}

function formFrom(post: Post) {
  const base = emptyForm();
  const next: any = { ...base };
  for (const key of Object.keys(base)) if (key in post && post[key] != null) next[key] = post[key];
  next.tags = (post.tags || []).join(", "); next.focus_keywords = (post.focus_keywords || []).join(", ");
  next.published_at = post.published_at ? new Date(new Date(post.published_at).getTime() - new Date(post.published_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  next.access_expires_at = post.access_expires_at ? new Date(new Date(post.access_expires_at).getTime() - new Date(post.access_expires_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  return next;
}

export default function IntelligenceManager({
  initialView = "overview",
  editId,
}: {
  initialView?: ModuleView;
  editId?: string;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [postsResponse, authorsResponse] = await Promise.all([
      fetch("/api/admin/blog?includeDeleted=true", { cache: "no-store", credentials: "include" }),
      fetch("/api/admin/blog/authors", { cache: "no-store", credentials: "include" }),
    ]);
    const [postsJson, authorsJson] = await Promise.all([postsResponse.json(), authorsResponse.json()]);
    if (postsJson.ok) setPosts(postsJson.posts || []);
    if (authorsJson.ok) setAuthors((authorsJson.authors || []).filter((author: Author) => author.is_active !== false));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function navigate(next: ModuleView) { router.push(MODULE_ROUTES[next]); }
  function edit(post: Post) { router.push(`/admin/intelligence/create?edit=${encodeURIComponent(post.id)}`); }
  async function remove(post: Post) {
    if (!await appConfirm(`Move “${post.title}” to Deleted? You can restore or permanently remove it later.`)) return;
    const response = await fetch(`/api/admin/blog?id=${post.id}`, { method: "DELETE", credentials: "include" });
    const json = await response.json();
    if (!response.ok) return appAlert(json.error || "Could not delete publication.");
    appToast("Publication moved to Deleted"); load();
  }

  const live = posts.filter((post) => post.status === "published").length;
  const privateCount = posts.filter((post) => post.access_level === "private_client").length;
  const totalViews = posts.reduce((sum, post) => sum + Number(post.views || 0), 0);
  const totalEngagement = posts.reduce((sum, post) => sum + Number(post.likes_count || 0) + Number(post.loves_count || 0) + Number(post.comments_count || 0), 0);
  const editing = initialView === "create" && editId ? posts.find((post) => post.id === editId) || null : null;

  return <div className="min-w-0 text-[#07123F]">
    {loading ? <div className="grid min-h-[520px] place-items-center rounded-2xl border border-gray-100 bg-white shadow-sm"><Loader2 className="size-7 animate-spin text-[#075BE5]" /></div> : initialView === "overview" ? <Overview posts={posts} live={live} privateCount={privateCount} totalViews={totalViews} totalEngagement={totalEngagement} onEdit={edit} /> : initialView === "create" ? <PublicationWizard initial={editing} authors={authors} onDone={() => { router.push(MODULE_ROUTES.all); void load(); }} onCancel={() => navigate("all")} /> : initialView === "comments" ? <CommentsManager /> : initialView === "analytics" ? <AnalyticsManager posts={posts} /> : initialView === "authors" ? <AuthorsManager authors={authors} onChanged={load} /> : initialView === "categories" || initialView === "tags" ? <TaxonomyManager initialKind={initialView === "categories" ? "category" : "tag"} /> : initialView === "settings" ? <SettingsManager /> : <PublicationTable view={initialView} posts={posts} onEdit={edit} onDelete={remove} onViewChange={navigate} />}
  </div>;
}

function Overview({ posts, live, privateCount, totalViews, totalEngagement, onEdit }: any) {
  const cards = [["Published", live, FileCheck2, "text-emerald-600 bg-emerald-50"], ["Private reports", privateCount, ShieldCheck, "text-violet-600 bg-violet-50"], ["Total views", totalViews.toLocaleString(), Eye, "text-blue-600 bg-blue-50"], ["Engagement", totalEngagement.toLocaleString(), Heart, "text-rose-600 bg-rose-50"]];
  return <div className="max-w-[1280px]"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, Icon, classes]) => <div key={String(label)} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><span className={`grid size-9 place-items-center rounded-xl ${classes}`}><Icon className="size-4" /></span><p className="mt-4 text-[25px] font-bold">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[.1em] text-[#98A2B3]">{label}</p></div>)}</div><div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]"><section className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-[#EDF1F7] px-5 py-4"><h3 className="text-[13px] font-bold">Recently updated</h3></div><div className="divide-y divide-[#EDF1F7]">{posts.filter((post: Post) => post.status !== "deleted").slice(0, 7).map((post: Post) => <button key={post.id} onClick={() => onEdit(post)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#F8FAFE]"><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{post.title}</p><p className="mt-1 text-[9px] text-[#98A2B3]">{post.publication_type} · {new Date(post.updated_at).toLocaleString()}</p></div><Status status={post.status} /></button>)}</div></section><section className="rounded-2xl bg-[#07123F] p-6 text-white shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8DB5FF]">Editorial workflow</p><h3 className="mt-3 text-[20px] font-bold">Research stays accountable.</h3><p className="mt-3 text-[12px] leading-6 text-white/60">Use In Review and Approved before scheduling. Every update creates a version snapshot; AI-assisted work is marked internally and never auto-published.</p><div className="mt-6 space-y-3">{[["Draft", posts.filter((p: Post) => p.status === "draft").length], ["In review", posts.filter((p: Post) => p.status === "in_review").length], ["Approved", posts.filter((p: Post) => p.status === "approved").length], ["Scheduled", posts.filter((p: Post) => p.status === "scheduled").length]].map(([label, count]) => <div key={String(label)} className="flex items-center justify-between border-b border-white/10 pb-3 text-[11px]"><span className="text-white/60">{label}</span><strong>{count}</strong></div>)}</div></section></div></div>;
}

function Status({ status }: { status: string }) {
  const meta: Record<string, string> = { published: "bg-emerald-50 text-emerald-700", scheduled: "bg-amber-50 text-amber-700", approved: "bg-blue-50 text-blue-700", in_review: "bg-violet-50 text-violet-700", private: "bg-purple-50 text-purple-700", deleted: "bg-red-50 text-red-600" };
  return <span className={`shrink-0 rounded-[4px] px-2 py-1 text-[8px] font-bold uppercase tracking-[.08em] ${meta[status] || "bg-[#F2F4F8] text-[#667085]"}`}>{status.replaceAll("_", " ")}</span>;
}

function viewPredicate(view: ModuleView, post: Post) {
  if (view === "reports") return /report|research note/i.test(post.publication_type);
  if (view === "audits") return /audit/i.test(post.publication_type);
  if (view === "benchmarks") return /benchmark|scorecard/i.test(post.publication_type);
  if (view === "briefs") return /brief|executive insight/i.test(post.publication_type);
  if (view === "cases") return /case study/i.test(post.publication_type);
  if (view === "private") return post.access_level === "private_client";
  if (view === "archive") return ["archived", "deleted"].includes(post.status);
  return !["archived", "deleted"].includes(post.status);
}

function PublicationTable({ view, posts, onEdit, onDelete, onViewChange }: { view: ModuleView; posts: Post[]; onEdit: (post: Post) => void; onDelete: (post: Post) => void; onViewChange: (view: ModuleView) => void }) {
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all");
  const list = posts.filter((post) => viewPredicate(view, post)).filter((post) => status === "all" || post.status === status).filter((post) => !search || `${post.title} ${post.publication_type} ${post.category}`.toLowerCase().includes(search.toLowerCase()));
  const showTypeFilters = view !== "private" && view !== "archive";
  return <div className="max-w-[1280px]">{showTypeFilters && <div className="mb-3 flex gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">{PUBLICATION_FILTERS.map((filter) => <button key={filter.key} onClick={() => onViewChange(filter.key)} className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${view === filter.key ? "bg-blue-50 text-[#075BE5]" : "text-[#667085] hover:bg-gray-50 hover:text-[#07123F]"}`}>{filter.label}</button>)}</div>}<section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex flex-wrap items-center gap-3 border-b border-[#EDF1F7] p-4"><label className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, type or category…" className={`${input} pl-9`} /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className={`${input} max-w-[180px]`}><option value="all">All statuses</option>{BLOG_STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><span className="text-[10px] font-semibold text-[#98A2B3]">{list.length} publication{list.length === 1 ? "" : "s"}</span></div>{list.length === 0 ? <div className="grid min-h-[320px] place-items-center text-center"><div><FileSearch className="mx-auto size-9 text-[#C7D0E3]" /><p className="mt-4 text-[13px] font-semibold">No matching publications</p><p className="mt-1 text-[10px] text-[#98A2B3]">Adjust the filter or create new research.</p></div></div> : <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left"><thead className="bg-[#F8FAFE] text-[9px] uppercase tracking-[.1em] text-[#98A2B3]"><tr><th className="px-5 py-3">Publication</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Performance</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#EDF1F7]">{list.map((post) => <tr key={post.id} className="hover:bg-[#FAFBFE]"><td className="px-5 py-4"><p className="max-w-[360px] truncate text-[12px] font-semibold">{post.title}</p><p className="mt-1 text-[9px] text-[#98A2B3]">/intelligence/{post.slug}</p></td><td className="px-4 py-4 text-[10px] text-[#667085]">{post.publication_type}</td><td className="px-4 py-4"><Status status={post.status} /></td><td className="px-4 py-4 text-[10px] capitalize text-[#667085]">{String(post.access_level || "public").replaceAll("_", " ")}</td><td className="px-4 py-4 text-[9px] text-[#667085]">{post.views || 0} views · {(post.likes_count || 0) + (post.loves_count || 0)} reactions</td><td className="px-5 py-4"><div className="flex justify-end gap-1">{post.status === "published" && <Link href={`/intelligence/${post.slug}`} target="_blank" rel="noopener noreferrer" className="rounded-[4px] p-2 text-[#667085] hover:bg-blue-50 hover:text-[#075BE5]" title="View"><Eye className="size-4" /></Link>}<button onClick={() => onEdit(post)} className="rounded-[4px] p-2 text-[#667085] hover:bg-blue-50 hover:text-[#075BE5]" title="Edit"><Pencil className="size-4" /></button>{post.status !== "deleted" && <button onClick={() => onDelete(post)} className="rounded-[4px] p-2 text-[#667085] hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="size-4" /></button>}</div></td></tr>)}</tbody></table></div>}</section></div>;
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) { return <label className="block"><span className="text-[10px] font-bold uppercase tracking-[.08em] text-[#667085]">{children}</span>{hint && <span className="ml-2 text-[9px] font-normal normal-case tracking-normal text-[#98A2B3]">{hint}</span>}</label>; }
function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) { return <label className="flex items-start justify-between gap-4 rounded-[8px] border border-[#DDE5F4] bg-white p-3"><span><span className="block text-[11px] font-semibold">{label}</span>{hint && <span className="mt-1 block text-[9px] leading-4 text-[#98A2B3]">{hint}</span>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 accent-[#075BE5]" /></label>; }

/* Legacy nine-step publisher kept here as a migration reference.
function LegacyPublicationWizard({ initial, authors, onDone, onCancel }: { initial: Post | null; authors: Author[]; onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState(0); const [form, setForm] = useState<any>(() => initial ? formFrom(initial) : emptyForm()); const [pdf, setPdf] = useState<File | null>(null); const [saving, setSaving] = useState(false); const [aiBusy, setAiBusy] = useState(false);
  const set = (key: string, value: unknown) => setForm((current: any) => ({ ...current, [key]: value }));
  async function aiAssist() { if (!form.title.trim()) return appAlert("Add a working title first."); setAiBusy(true); try { const response = await fetch("/api/admin/blog/ai", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.title, category: form.category, publicationType: form.publication_type }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error); const result = json.result; setForm((current: any) => ({ ...current, slug: current.slug || result.slug, subtitle: current.subtitle || result.subtitle, excerpt: current.excerpt || result.excerpt, content: current.content || result.content, executive_summary: current.executive_summary || result.executive_summary || result.excerpt, seo_title: current.seo_title || result.seo_title, seo_description: current.seo_description || result.seo_description, tags: current.tags || (result.tags || []).join(", "), ai_assisted: true })); appToast("AI draft added for editorial review."); } catch (error) { appAlert(error instanceof Error ? error.message : "AI assistance failed"); } finally { setAiBusy(false); } }
  async function save(statusOverride?: BlogStatus) { if (!form.title.trim()) return appAlert("A publication title is required."); setSaving(true); try { const payload: any = { ...form, ...(form.id ? { id: form.id } : {}), slug: form.slug || slugify(form.title), tags: form.tags.split(",").map((value: string) => value.trim()).filter(Boolean), focus_keywords: form.focus_keywords.split(",").map((value: string) => value.trim()).filter(Boolean), published_at: form.published_at ? new Date(form.published_at).toISOString() : null, access_expires_at: form.access_expires_at ? new Date(form.access_expires_at).toISOString() : null, status: statusOverride || form.status }; const response = await fetch("/api/admin/blog", { method: form.id ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const json = await response.json(); if (!response.ok || !json.ok) throw new Error(json.error || "Could not save publication"); const postId = json.post.id; if (pdf) { const data = new FormData(); data.set("file", pdf); data.set("postId", postId); const upload = await fetch("/api/admin/intelligence/upload", { method: "POST", credentials: "include", body: data }); const uploaded = await upload.json(); if (!upload.ok) throw new Error(`Publication saved, but PDF upload failed: ${uploaded.error}`); } appToast(statusOverride === "published" ? "Publication is live" : "Publication saved"); onDone(); } catch (error) { appAlert(error instanceof Error ? error.message : "Could not save publication"); } finally { setSaving(false); } }
  const panel = "rounded-[16px] border border-[#DDE5F4] bg-white p-5 sm:p-6";

  return <div className="max-w-[1120px]"><header className="flex flex-wrap items-center justify-between gap-4"><div><button onClick={onCancel} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#075BE5]"><ChevronLeft className="size-3.5" />All publications</button><h2 className="mt-2 text-[28px] font-bold tracking-[-.03em]">{initial ? "Edit publication" : "Create publication"}</h2><p className="mt-1 text-[11px] text-[#667085]">Step {step + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[step]}</p></div><div className="flex gap-2"><button onClick={aiAssist} disabled={aiBusy} className="inline-flex items-center gap-2 rounded-[8px] border border-[#BFD2FA] bg-[#EEF4FF] px-4 py-2.5 text-[11px] font-semibold text-[#075BE5]">{aiBusy ? <Loader2 className="size-4 animate-spin" /> : <UserRoundPen className="size-4" />}AI research assistant</button><button onClick={() => save("draft")} disabled={saving} className="inline-flex items-center gap-2 rounded-[8px] border border-[#DDE5F4] bg-white px-4 py-2.5 text-[11px] font-semibold"><Save className="size-4" />Save draft</button></div></header>
    <div className="mt-6 overflow-x-auto"><div className="flex min-w-[820px] gap-1">{WIZARD_STEPS.map((label, index) => <button key={label} onClick={() => setStep(index)} className={`flex-1 border-t-2 px-2 py-3 text-left text-[9px] font-semibold ${step === index ? "border-[#075BE5] text-[#075BE5]" : index < step ? "border-emerald-400 text-emerald-600" : "border-[#DDE5F4] text-[#98A2B3]"}`}><span className="mr-1">{index < step ? "✓" : index + 1}.</span>{label}</button>)}</div></div>
    <div className="mt-5">{step === 0 && <section className={panel}><h3 className="text-[16px] font-bold">Choose the research format</h3><p className="mt-1 text-[10px] text-[#667085]">This controls discovery filters and the publication&apos;s metadata language.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{INTELLIGENCE_PUBLICATION_TYPES.map((type) => <button key={type} onClick={() => set("publication_type", type)} className={`min-h-24 rounded-[12px] border p-4 text-left transition ${form.publication_type === type ? "border-[#075BE5] bg-[#EEF4FF]" : "border-[#DDE5F4] bg-white hover:border-[#9DBBF7]"}`}><span className={`grid size-8 place-items-center rounded-[8px] ${form.publication_type === type ? "bg-[#075BE5] text-white" : "bg-[#F2F4F8] text-[#667085]"}`}><FileText className="size-4" /></span><span className="mt-3 block text-[11px] font-semibold leading-4">{type}</span></button>)}</div></section>}
      {step === 1 && <section className={panel}><div className="grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Publication title</Label><input value={form.title} onChange={(e) => set("title", e.target.value)} className={`${input} mt-2 text-[14px] font-semibold`} placeholder="A precise, useful research title" /></div><div><Label>Slug</Label><input value={form.slug} onChange={(e) => set("slug", e.target.value)} className={`${input} mt-2`} placeholder={slugify(form.title) || "publication-slug"} /></div><div><Label>Category</Label><select value={form.category} onChange={(e) => set("category", e.target.value)} className={`${input} mt-2`}>{BLOG_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div><div className="sm:col-span-2"><Label>Subtitle</Label><input value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} className={`${input} mt-2`} /></div><div className="sm:col-span-2"><Label>Card excerpt</Label><textarea value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} className={`${textarea} mt-2`} /></div><div><Label>Author</Label><select value={form.author_id} onChange={(e) => set("author_id", e.target.value)} className={`${input} mt-2`}><option value="">CDS Space Research</option>{authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}</select></div><div><Label>Series or collection</Label><input value={form.series} onChange={(e) => set("series", e.target.value)} className={`${input} mt-2`} /></div><div><Label>Industry</Label><input value={form.industry} onChange={(e) => set("industry", e.target.value)} className={`${input} mt-2`} /></div><div><Label>Company analysed</Label><input value={form.company_analysed} onChange={(e) => set("company_analysed", e.target.value)} className={`${input} mt-2`} /></div><div><Label>Country / market</Label><input value={form.country} onChange={(e) => set("country", e.target.value)} className={`${input} mt-2`} /></div><div><Label>City</Label><input value={form.city} onChange={(e) => set("city", e.target.value)} className={`${input} mt-2`} /></div><div className="sm:col-span-2"><Label>Tags <span className="normal-case">(comma separated)</span></Label><input value={form.tags} onChange={(e) => set("tags", e.target.value)} className={`${input} mt-2`} /></div></div></section>}
      {step === 2 && <section className={panel}><div className="grid gap-6 lg:grid-cols-2"><div><Label>Cover image</Label><div className="mt-2"><AssetUrlField value={form.cover_url} onChange={(url) => set("cover_url", url)} accept="image" folder="intelligence/covers" placeholder="Upload or paste a secure image URL" /></div>{form.cover_url && <img src={form.cover_url} alt="Cover preview" className="mt-3 aspect-[16/9] w-full rounded-[12px] object-cover" />}</div><div><Label>Full report PDF <span className="normal-case">(private storage, 75MB max)</span></Label><label className="mt-2 grid min-h-[180px] cursor-pointer place-items-center rounded-[12px] border border-dashed border-[#9DBBF7] bg-[#F7F9FE] p-6 text-center"><input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => setPdf(e.target.files?.[0] || null)} /><span><Upload className="mx-auto size-7 text-[#075BE5]" /><strong className="mt-3 block text-[11px]">{pdf?.name || form.pdf_display_name || "Choose research PDF"}</strong><span className="mt-1 block text-[9px] text-[#98A2B3]">Magic bytes, MIME, active content and malware signatures are checked.</span></span></label><Label>Document permission</Label><select value={form.pdf_access_mode} onChange={(e) => set("pdf_access_mode", e.target.value)} className={`${input} mt-2`}>{INTELLIGENCE_PDF_ACCESS.map((mode) => <option key={mode} value={mode}>{mode === "view" ? "View only" : mode === "download" ? "View + download" : "View + download + print"}</option>)}</select></div><div className="lg:col-span-2"><Label>Supporting video URL <span className="normal-case">(YouTube or Vimeo)</span></Label><input value={form.video_url} onChange={(e) => set("video_url", e.target.value)} className={`${input} mt-2`} /></div></div></section>}
      {step === 3 && <section className={panel}><Label>Executive summary</Label><textarea value={form.executive_summary} onChange={(e) => set("executive_summary", e.target.value)} className={`${textarea} mt-2 min-h-36`} placeholder="Concise findings for decision-makers…" /><div className="mt-5"><Label>Rich publication content</Label><div className="mt-2"><RichTextEditor value={form.content} onChange={(html) => set("content", html)} placeholder="Write the research body, findings, tables, references and footnotes…" /></div></div></section>}
      {step === 4 && <section className={panel}><h3 className="text-[16px] font-bold">Reader engagement controls</h3><div className="mt-5 grid gap-3 sm:grid-cols-2">{[["comments_enabled", "Comments", "Allow signed-in readers to comment."], ["replies_enabled", "Threaded replies", "Allow replies below top-level comments."], ["reactions_enabled", "Like and Love", "One active reaction per signed-in reader."], ["sharing_enabled", "Social sharing", "LinkedIn, Facebook, X, WhatsApp, Telegram, email and copy link."], ["view_count_enabled", "Public view count", "Show total reads in publication metadata."], ["downloads_enabled", "Downloads", "Also controlled by the document permission selected earlier."], ["printing_enabled", "Printing", "Only available with the print-enabled PDF mode."], ["featured", "Feature this publication", "Use as the lead story on Intelligence."]].map(([key, label, hint]) => <Toggle key={key} label={label} hint={hint} checked={Boolean(form[key])} onChange={(value) => set(key, value)} />)}</div></section>}
      {step === 5 && <section className={panel}><div className="grid gap-5 sm:grid-cols-2"><div><Label>CTA type</Label><select value={form.cta_type} onChange={(e) => set("cta_type", e.target.value)} className={`${input} mt-2`}>{INTELLIGENCE_CTA_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></div><div><Label>Button URL</Label><input value={form.cta_url} onChange={(e) => set("cta_url", e.target.value)} className={`${input} mt-2`} placeholder="https:// or /internal-path" /></div><div className="sm:col-span-2"><Label>CTA headline</Label><input value={form.cta_text} onChange={(e) => set("cta_text", e.target.value)} className={`${input} mt-2`} /></div><div className="sm:col-span-2"><Label>Supporting line</Label><textarea value={form.cta_supporting_line} onChange={(e) => set("cta_supporting_line", e.target.value)} className={`${textarea} mt-2`} /></div></div></section>}
      {step === 6 && <section className={panel}><div className="grid gap-5 sm:grid-cols-2"><div><Label>SEO title</Label><input value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} className={`${input} mt-2`} /><p className="mt-1 text-right text-[9px] text-[#98A2B3]">{form.seo_title.length}/60</p></div><div><Label>Canonical URL</Label><input value={form.canonical_url} onChange={(e) => set("canonical_url", e.target.value)} className={`${input} mt-2`} /></div><div className="sm:col-span-2"><Label>SEO description</Label><textarea value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} className={`${textarea} mt-2`} /><p className="mt-1 text-right text-[9px] text-[#98A2B3]">{form.seo_description.length}/160</p></div><div className="sm:col-span-2"><Label>Focus keywords</Label><input value={form.focus_keywords} onChange={(e) => set("focus_keywords", e.target.value)} className={`${input} mt-2`} /></div><div><Label>Social title</Label><input value={form.social_title} onChange={(e) => set("social_title", e.target.value)} className={`${input} mt-2`} /></div><div><Label>Social image URL</Label><input value={form.social_image_url} onChange={(e) => set("social_image_url", e.target.value)} className={`${input} mt-2`} /></div><div className="sm:col-span-2"><Label>Social description</Label><textarea value={form.social_description} onChange={(e) => set("social_description", e.target.value)} className={`${textarea} mt-2`} /></div></div></section>}
      {step === 7 && <section className={panel}><div className="grid gap-5 sm:grid-cols-2"><div><Label>Access level</Label><select value={form.access_level} onChange={(e) => set("access_level", e.target.value)} className={`${input} mt-2`}>{INTELLIGENCE_ACCESS_LEVELS.map((level) => <option key={level} value={level}>{level.replaceAll("_", " ")}</option>)}</select></div><div><Label>Access expiry</Label><input type="datetime-local" value={form.access_expires_at} onChange={(e) => set("access_expires_at", e.target.value)} className={`${input} mt-2`} /></div>{form.access_level === "private_client" && <div className="sm:col-span-2"><Label>Assigned client UUID</Label><input value={form.assigned_client_id} onChange={(e) => set("assigned_client_id", e.target.value)} className={`${input} mt-2`} placeholder="Client auth user ID" /></div>}<div className="sm:col-span-2"><Label>Internal notes</Label><textarea value={form.internal_notes} onChange={(e) => set("internal_notes", e.target.value)} className={`${textarea} mt-2`} placeholder="Never shown publicly." /></div></div></section>}
      {step === 8 && <section className={panel}><div className="grid gap-6 lg:grid-cols-[1fr_320px]"><div><p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#075BE5]">{form.publication_type}</p><h3 className="mt-3 text-[30px] font-bold leading-tight tracking-[-.03em]">{form.title || "Untitled publication"}</h3><p className="mt-3 text-[13px] leading-6 text-[#667085]">{form.subtitle || form.excerpt || "Add a subtitle or excerpt to complete the preview."}</p>{form.cover_url && <img src={form.cover_url} alt="" className="mt-5 aspect-[16/8] w-full rounded-[12px] object-cover" />}<div className="mt-5 rounded-[12px] bg-[#EEF4FF] p-5"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#075BE5]">Executive summary</p><p className="mt-2 whitespace-pre-line text-[12px] leading-6">{form.executive_summary || "No executive summary added yet."}</p></div></div><aside className="space-y-4"><div className="rounded-[12px] border border-[#DDE5F4] p-4"><h4 className="text-[12px] font-bold">Publication checklist</h4><div className="mt-4 space-y-2">{[["Title", form.title], ["Excerpt", form.excerpt], ["Content", form.content], ["SEO description", form.seo_description], ["Author", form.author_id], ["Cover", form.cover_url]].map(([label, value]) => <div key={label as string} className="flex items-center justify-between text-[10px]"><span className="text-[#667085]">{label}</span><span className={value ? "text-emerald-600" : "text-amber-600"}>{value ? "Ready" : "Optional / missing"}</span></div>)}</div></div><div className="rounded-[12px] border border-[#DDE5F4] p-4"><Label>Workflow status</Label><select value={form.status} onChange={(e) => set("status", e.target.value)} className={`${input} mt-2`}>{BLOG_STATUSES.filter((status) => status !== "deleted").map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>{form.status === "scheduled" && <><Label>Publish at</Label><input type="datetime-local" value={form.published_at} onChange={(e) => set("published_at", e.target.value)} className={`${input} mt-2`} /></>}<div className="mt-4 grid gap-2"><button onClick={() => save()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#DDE5F4] px-4 py-3 text-[11px] font-semibold">{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save with status</button><button onClick={() => save("published")} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[#075BE5] px-4 py-3 text-[11px] font-semibold text-white"><Check className="size-4" />Publish now</button></div></div></aside></div></section>}
    </div>
    <footer className="mt-5 flex items-center justify-between"><button onClick={() => step ? setStep(step - 1) : onCancel()} className="inline-flex items-center gap-1 rounded-[8px] border border-[#DDE5F4] bg-white px-4 py-2.5 text-[11px] font-semibold"><ChevronLeft className="size-4" />{step ? "Previous" : "Cancel"}</button>{step < WIZARD_STEPS.length - 1 && <button onClick={() => setStep(step + 1)} className="inline-flex items-center gap-1 rounded-[8px] bg-[#07123F] px-4 py-2.5 text-[11px] font-semibold text-white">Continue <ChevronRight className="size-4" /></button>}</footer>
  </div>;
}
*/

function PublicationWizard({ initial, authors, onDone, onCancel }: { initial: Post | null; authors: Author[]; onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>(() => initial ? formFrom(initial) : emptyForm());
  const [pdf, setPdf] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedAuthor = authors.find((author) => author.id === form.author_id);
  const pattern = publicationPattern(form.publication_type);
  const panel = "rounded-[16px] border border-[#DDE5F4] bg-white p-5 sm:p-6";
  const set = (key: string, value: unknown) => setForm((current: any) => ({ ...current, [key]: value }));

  function chooseType(type: string) {
    const nextPattern = publicationPattern(type);
    setForm((current: any) => ({
      ...current,
      publication_type: type,
      category: nextPattern.category,
      access_level: nextPattern.privateByDefault
        ? "private_client"
        : publicationPattern(current.publication_type).privateByDefault ? "public" : current.access_level,
    }));
  }

  function setShortSummary(value: string) {
    setForm((current: any) => ({
      ...current,
      excerpt: value,
      executive_summary: !current.executive_summary || current.executive_summary === current.excerpt ? value : current.executive_summary,
      seo_description: !current.seo_description || current.seo_description === current.excerpt ? value : current.seo_description,
    }));
  }

  function continueFlow() {
    if (step === 0 && !form.title.trim()) return appAlert("Add a publication title first.");
    setStep((current) => Math.min(WIZARD_STEPS.length - 1, current + 1));
  }

  async function save(statusOverride?: BlogStatus) {
    if (!form.title.trim()) return appAlert("A publication title is required.");
    const requestedStatus = statusOverride || form.status;
    if (requestedStatus === "published" && selectedAuthor?.is_external && !form.original_source_url?.trim()) {
      return appAlert("Add the original post URL for this report originator.");
    }
    if (requestedStatus === "scheduled" && !form.published_at) {
      return appAlert("Choose the date and time for this scheduled publication.");
    }

    setSaving(true);
    try {
      let optimizationNotice = "";
      const stageUntilPdfIsReady = Boolean(pdf) && ["published", "scheduled"].includes(requestedStatus);
      const payload: any = {
        ...form,
        ...(form.id ? { id: form.id } : {}),
        slug: form.slug || slugify(form.title),
        tags: String(form.tags || "").split(",").map((value) => value.trim()).filter(Boolean),
        focus_keywords: String(form.focus_keywords || "").split(",").map((value) => value.trim()).filter(Boolean),
        published_at: form.published_at ? new Date(form.published_at).toISOString() : null,
        access_expires_at: form.access_expires_at ? new Date(form.access_expires_at).toISOString() : null,
        status: stageUntilPdfIsReady ? "draft" : requestedStatus,
        downloads_enabled: ["download", "download_print"].includes(form.pdf_access_mode),
        printing_enabled: form.pdf_access_mode === "download_print",
      };
      const response = await fetch("/api/admin/blog", {
        method: form.id ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Could not save publication");
      const postId = json.post.id;
      if (pdf) {
        const data = new FormData();
        data.set("file", pdf);
        data.set("postId", postId);
        const upload = await fetch("/api/admin/intelligence/upload", { method: "POST", credentials: "include", body: data });
        const uploaded = await upload.json();
        if (!upload.ok) throw new Error(`Publication saved, but PDF upload failed: ${uploaded.error}`);
        if (uploaded.optimization?.optimized) {
          const saved = Number(uploaded.optimization.savedBytes || 0);
          optimizationNotice = saved > 0
            ? ` · PDF reduced by ${uploaded.optimization.savingsPercent}%`
            : " · PDF optimized for web viewing";
        }
      }
      if (stageUntilPdfIsReady) {
        const publish = await fetch("/api/admin/blog", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: postId,
            status: requestedStatus,
            ...(form.published_at ? { published_at: new Date(form.published_at).toISOString() } : {}),
          }),
        });
        const published = await publish.json();
        if (!publish.ok || !published.ok) {
          throw new Error(published.error || "The document was saved as a draft, but could not be published.");
        }
      }
      appToast(`${requestedStatus === "published" ? "Publication is live" : "Publication saved"}${optimizationNotice}`);
      onDone();
    } catch (error) {
      appAlert(error instanceof Error ? error.message : "Could not save publication");
    } finally {
      setSaving(false);
    }
  }

  return <div className="max-w-[1060px]">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <button onClick={onCancel} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#075BE5]"><ChevronLeft className="size-3.5" />All publications</button>
        <p className="mt-2 text-[11px] font-semibold text-[#667085]">PDF-first publishing · Step {step + 1} of {WIZARD_STEPS.length}</p>
      </div>
      <button onClick={() => save("draft")} disabled={saving} className="inline-flex items-center gap-2 rounded-[8px] border border-[#DDE5F4] bg-white px-4 py-2.5 text-[11px] font-semibold disabled:opacity-50"><Save className="size-4" />Save draft</button>
    </header>

    <div className="mt-6 grid grid-cols-3 gap-2 rounded-[12px] border border-[#DDE5F4] bg-white p-2">
      {WIZARD_STEPS.map((label, index) => <button key={label} onClick={() => setStep(index)} className={`rounded-[8px] px-3 py-2.5 text-[10px] font-semibold transition ${step === index ? "bg-[#075BE5] text-white" : index < step ? "bg-emerald-50 text-emerald-700" : "text-[#98A2B3] hover:bg-[#F4F7FC]"}`}>{index + 1}. {label}</button>)}
    </div>

    <div className="mt-5">
      {step === 0 && <section className={panel}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Publication type</Label><select value={form.publication_type} onChange={(event) => chooseType(event.target.value)} className={`${input} mt-2`}>{INTELLIGENCE_PUBLICATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div>
          <div className="sm:col-span-2"><Label>Title</Label><input value={form.title} onChange={(event) => set("title", event.target.value)} maxLength={220} className={`${input} mt-2 text-[14px] font-semibold`} placeholder="Clear publication title" /></div>
          <div className="sm:col-span-2"><Label>{pattern.summaryLabel}</Label><textarea value={form.excerpt} onChange={(event) => setShortSummary(event.target.value)} maxLength={320} className={`${textarea} mt-2 min-h-20`} placeholder={pattern.summaryPlaceholder} /><p className="mt-1 text-right text-[9px] text-[#98A2B3]">{String(form.excerpt || "").length}/320</p></div>
          <div><Label>Author</Label><select value={form.author_id} onChange={(event) => { const author = authors.find((item) => item.id === event.target.value); setForm((current: any) => ({ ...current, author_id: event.target.value, original_source_url: author?.is_external ? current.original_source_url : "" })); }} className={`${input} mt-2`}><option value="">CDS Space Research</option>{authors.map((author) => <option key={author.id} value={author.id}>{author.name}{author.is_external ? " · Report originator" : ""}</option>)}</select></div>
          {selectedAuthor?.is_external ? <div><Label>Original post URL</Label><input type="url" value={form.original_source_url} onChange={(event) => set("original_source_url", event.target.value)} className={`${input} mt-2`} placeholder="https://original-publication.com/post" /></div> : <div><Label>Category</Label><input value={pattern.category} readOnly className={`${input} mt-2 bg-[#F7F9FC] text-[#667085]`} /></div>}
          {pattern.fields.map((field) => <div key={field.key}><Label>{field.label}</Label><input value={form[field.key] || ""} onChange={(event) => set(field.key, event.target.value)} className={`${input} mt-2`} placeholder={field.placeholder} /></div>)}
        </div>
      </section>}

      {step === 1 && <section className={panel}>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <Label>Publication PDF <span className="normal-case">(75MB max)</span></Label>
            <label className="mt-2 grid min-h-[220px] cursor-pointer place-items-center rounded-[12px] border border-dashed border-[#8CB2FF] bg-[#F5F8FF] p-6 text-center transition hover:bg-[#EEF4FF]"><input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => setPdf(event.target.files?.[0] || null)} /><span><Upload className="mx-auto size-8 text-[#075BE5]" /><strong className="mt-3 block text-[12px]">{pdf?.name || form.pdf_display_name || "Choose PDF"}</strong><span className="mt-1 block text-[9px] leading-4 text-[#98A2B3]">Automatically compressed and optimized for fast online reading before it is saved.</span></span></label>
            <div className="mt-4"><Label>Reader permission</Label><select value={form.pdf_access_mode} onChange={(event) => set("pdf_access_mode", event.target.value)} className={`${input} mt-2`}>{INTELLIGENCE_PDF_ACCESS.map((mode) => <option key={mode} value={mode}>{mode === "view" ? "View only" : mode === "download" ? "View and download" : "View, download and print"}</option>)}</select></div>
          </div>
          <div className="space-y-4">
            <div><Label>Cover image <span className="normal-case">(optional)</span></Label><div className="mt-2"><AssetUrlField value={form.cover_url} onChange={(url) => set("cover_url", url)} accept="image" folder="intelligence/covers" placeholder="Upload cover" /></div><p className="mt-2 text-[9px] leading-4 text-[#98A2B3]">If omitted, page one of the PDF is generated and saved as the cover before publication.</p>{form.cover_url && <img src={form.cover_url} alt="Cover preview" className="mt-3 aspect-[16/9] w-full rounded-[12px] object-cover" />}</div>
            <div><Label>Access</Label><select value={form.access_level} onChange={(event) => set("access_level", event.target.value)} className={`${input} mt-2`}>{INTELLIGENCE_ACCESS_LEVELS.map((level) => <option key={level} value={level}>{level.replaceAll("_", " ")}</option>)}</select></div>
            {form.access_level === "private_client" && <div><Label>Assigned client UUID</Label><input value={form.assigned_client_id} onChange={(event) => set("assigned_client_id", event.target.value)} className={`${input} mt-2`} placeholder="Client auth user ID" /></div>}
          </div>
        </div>
      </section>}

      {step === 2 && <section className={panel}>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#075BE5]">{form.publication_type}</p>
            <h3 className="mt-3 text-[30px] font-bold leading-tight tracking-[-.03em]">{form.title || "Untitled publication"}</h3>
            <p className="mt-3 text-[13px] leading-6 text-[#667085]">{form.excerpt || "No short summary added."}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[9px] font-semibold"><span className="rounded-[4px] bg-[#EEF4FF] px-2 py-1 text-[#075BE5]">{pattern.category}</span><span className="rounded-[4px] bg-[#F2F4F8] px-2 py-1 text-[#667085]">{selectedAuthor?.name || "CDS Space Research"}</span>{(pdf || form.pdf_storage_path) && <span className="rounded-[4px] bg-emerald-50 px-2 py-1 text-emerald-700">PDF ready</span>}</div>
            <details className="mt-6 rounded-[12px] border border-[#DDE5F4] bg-[#FAFBFE] p-4"><summary className="cursor-pointer text-[11px] font-semibold">Optional publishing controls</summary><div className="mt-4 grid gap-3 sm:grid-cols-2"><Toggle label="Featured" checked={Boolean(form.featured)} onChange={(value) => set("featured", value)} /><Toggle label="Comments" checked={Boolean(form.comments_enabled)} onChange={(value) => set("comments_enabled", value)} /><Toggle label="Reactions" checked={Boolean(form.reactions_enabled)} onChange={(value) => set("reactions_enabled", value)} /><Toggle label="Sharing" checked={Boolean(form.sharing_enabled)} onChange={(value) => set("sharing_enabled", value)} /><div className="sm:col-span-2"><Label>SEO title <span className="normal-case">(optional)</span></Label><input value={form.seo_title} onChange={(event) => set("seo_title", event.target.value)} className={`${input} mt-2`} /></div></div></details>
          </div>
          <aside className="rounded-[12px] border border-[#DDE5F4] p-4">
            <h4 className="text-[12px] font-bold">Ready to publish</h4>
            <div className="mt-4 space-y-2">{[["Title", form.title], ["Short summary", form.excerpt], ["PDF", pdf || form.pdf_storage_path], ["Saved cover", form.cover_url || pdf], ["Original source", !selectedAuthor?.is_external || form.original_source_url]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between text-[10px]"><span className="text-[#667085]">{label}</span><span className={value ? "text-emerald-600" : "text-amber-600"}>{value ? "Ready" : label === "PDF" ? "Recommended" : "Required"}</span></div>)}</div>
            <div className="mt-5"><Label>Status</Label><select value={form.status} onChange={(event) => set("status", event.target.value)} className={`${input} mt-2`}>{BLOG_STATUSES.filter((status) => status !== "deleted").map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>
            {form.status === "scheduled" && <div className="mt-4"><Label>Publish at</Label><input type="datetime-local" value={form.published_at} onChange={(event) => set("published_at", event.target.value)} className={`${input} mt-2`} /></div>}
            <div className="mt-5 grid gap-2"><button onClick={() => save()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#DDE5F4] px-4 py-3 text-[11px] font-semibold disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save</button><button onClick={() => save("published")} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[#075BE5] px-4 py-3 text-[11px] font-semibold text-white disabled:opacity-50"><Check className="size-4" />Publish now</button></div>
          </aside>
        </div>
      </section>}
    </div>

    <footer className="mt-5 flex items-center justify-between"><button onClick={() => step ? setStep(step - 1) : onCancel()} className="inline-flex items-center gap-1 rounded-[8px] border border-[#DDE5F4] bg-white px-4 py-2.5 text-[11px] font-semibold"><ChevronLeft className="size-4" />{step ? "Previous" : "Cancel"}</button>{step < WIZARD_STEPS.length - 1 && <button onClick={continueFlow} className="inline-flex items-center gap-1 rounded-[8px] bg-[#07123F] px-4 py-2.5 text-[11px] font-semibold text-white">Continue <ChevronRight className="size-4" /></button>}</footer>
  </div>;
}

function CommentsManager() {
  const [comments, setComments] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [status, setStatus] = useState("all"); const [search, setSearch] = useState("");
  const load = useCallback(() => { setLoading(true); fetch(`/api/admin/intelligence/comments?status=${status}&search=${encodeURIComponent(search)}`, { cache: "no-store", credentials: "include" }).then((r) => r.json()).then((j) => setComments(j.comments || [])).finally(() => setLoading(false)); }, [status, search]); useEffect(load, [load]);
  async function moderate(commentId: string, action: string) { const response = await fetch("/api/admin/intelligence/comments", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId, action }) }); const json = await response.json(); if (!response.ok) appAlert(json.error || "Moderation failed"); else { appToast(`Comment ${action}d`); load(); } }
  return <div className="max-w-[1180px]"><section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex gap-3 border-b border-[#EDF1F7] p-4"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search comments, readers or publications…" className={`${input} flex-1`} /><select value={status} onChange={(e) => setStatus(e.target.value)} className={`${input} max-w-[160px]`}><option value="all">All comments</option>{["pending", "approved", "hidden", "deleted"].map((value) => <option key={value}>{value}</option>)}</select></div>{loading ? <Loader2 className="mx-auto my-20 size-6 animate-spin text-[#075BE5]" /> : <div className="divide-y divide-[#EDF1F7]">{comments.map((comment) => <article key={comment.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold">{comment.author_name || comment.author_email || "Reader"}</p><p className="mt-1 text-[9px] text-[#98A2B3]">On {comment.publication_title} · {new Date(comment.created_at).toLocaleString()}</p></div><div className="flex items-center gap-2"><Status status={comment.status} />{comment.reports_count > 0 && <span className="rounded-[4px] bg-red-50 px-2 py-1 text-[8px] font-bold text-red-600">{comment.reports_count} reports</span>}</div></div><p className="mt-3 whitespace-pre-wrap text-[12px] leading-6 text-[#475467]">{comment.body}</p><div className="mt-4 flex flex-wrap gap-2">{comment.status !== "approved" && <button onClick={() => moderate(comment.id, "approve")} className="rounded-[4px] bg-emerald-50 px-3 py-1.5 text-[9px] font-semibold text-emerald-700">Approve</button>}{comment.status === "approved" && <button onClick={() => moderate(comment.id, "hide")} className="rounded-[4px] bg-amber-50 px-3 py-1.5 text-[9px] font-semibold text-amber-700">Hide</button>}{comment.status !== "deleted" && <button onClick={() => moderate(comment.id, "delete")} className="rounded-[4px] bg-red-50 px-3 py-1.5 text-[9px] font-semibold text-red-600">Delete</button>}{["hidden", "deleted"].includes(comment.status) && <button onClick={() => moderate(comment.id, "restore")} className="rounded-[4px] bg-blue-50 px-3 py-1.5 text-[9px] font-semibold text-blue-700">Restore</button>}</div></article>)}{comments.length === 0 && <div className="py-20 text-center text-[11px] text-[#98A2B3]">No comments match this view.</div>}</div>}</section></div>;
}

function AnalyticsManager({ posts }: { posts: Post[] }) {
  const [days, setDays] = useState(30); const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); fetch(`/api/admin/intelligence/analytics?days=${days}`, { cache: "no-store", credentials: "include" }).then((r) => r.json()).then(setData).finally(() => setLoading(false)); }, [days]);
  const totals = data?.totals || {}; const cards = [["Views", totals.views || 0], ["Unique readers", totals.unique_views || 0], ["PDF opens", totals.pdf_opens || 0], ["Downloads", totals.downloads || 0], ["Shares", totals.shares || 0], ["CTA clicks", totals.cta_clicks || 0], ["Average time", `${totals.avg_time || 0}s`], ["Average scroll", `${totals.avg_scroll || 0}%`]];
  return <div className="max-w-[1280px]"><div className="flex justify-end"><select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${input} max-w-[150px]`}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option></select></div>{loading ? <Loader2 className="mx-auto my-24 size-7 animate-spin text-[#075BE5]" /> : <><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-[22px] font-bold">{value}</p><p className="mt-1 text-[9px] uppercase tracking-[.1em] text-[#98A2B3]">{label}</p></div>)}</div><div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]"><section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><h3 className="text-[12px] font-bold">Daily readership</h3><div className="mt-6 flex h-56 items-end gap-1.5">{(data?.daily || []).map((row: any) => { const max = Math.max(...(data.daily || []).map((item: any) => item.views), 1); return <div key={row.date} title={`${row.date}: ${row.views} views`} className="group flex min-w-1 flex-1 flex-col items-center justify-end"><div className="w-full rounded-t-[4px] bg-[#075BE5]/80 transition group-hover:bg-[#075BE5]" style={{ height: `${Math.max(3, (row.views / max) * 100)}%` }} /></div>; })}</div></section><section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><h3 className="text-[12px] font-bold">Top publications</h3><div className="mt-4 space-y-4">{(data?.top || []).slice(0, 7).map((row: any, index: number) => <div key={row.id} className="flex gap-3"><span className="text-[10px] font-bold text-[#98A2B3]">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><p className="truncate text-[10px] font-semibold">{row.title}</p><p className="mt-1 text-[8px] text-[#98A2B3]">{row.views} views · {row.unique_views} readers</p></div></div>)}</div></section></div></>}</div>;
}

function AuthorsManager({ authors, onChanged }: { authors: Author[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<any>(null);

  function addAuthor(isExternal: boolean) {
    setEditing({ name: "", contributor_type: "author", is_external: isExternal, expertiseText: "" });
  }

  async function save() {
    if (!editing?.name?.trim()) return appAlert("Name is required");
    const response = await fetch("/api/admin/blog/authors", {
      method: editing.id ? "PATCH" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...editing,
        expertise: String(editing.expertiseText || "").split(",").map((value) => value.trim()).filter(Boolean),
      }),
    });
    const json = await response.json();
    if (!response.ok) return appAlert(json.error || "Could not save author");
    appToast(editing.is_external ? "Report originator saved" : "Author saved");
    setEditing(null);
    onChanged();
  }

  async function remove(id: string) {
    if (!await appConfirm("Deactivate this author? Existing publication attribution remains intact.")) return;
    await fetch(`/api/admin/blog/authors?id=${id}`, { method: "DELETE", credentials: "include" });
    onChanged();
  }

  return <div className="max-w-[1080px]">
    <div className="flex flex-wrap justify-end gap-4">
      <div className="flex gap-2"><button onClick={() => addAuthor(true)} className="inline-flex items-center gap-2 rounded-[8px] border border-[#BFD2FA] bg-white px-4 py-2.5 text-[11px] font-semibold text-[#075BE5]"><Plus className="size-4" />Report originator</button><button onClick={() => addAuthor(false)} className="inline-flex items-center gap-2 rounded-[8px] bg-[#075BE5] px-4 py-2.5 text-[11px] font-semibold text-white"><Plus className="size-4" />CDS author</button></div>
    </div>

    <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {authors.map((author) => <article key={author.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">{author.photo_url ? <img src={author.photo_url} alt="" className="size-11 rounded-full object-cover" /> : <span className="grid size-11 place-items-center rounded-full bg-[#EEF4FF] text-[14px] font-bold text-[#075BE5]">{author.name.charAt(0)}</span>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-[12px] font-bold">{author.name}</h3>{author.is_external && <span className="rounded-[4px] bg-violet-50 px-2 py-1 text-[8px] font-bold uppercase tracking-[.08em] text-violet-700">Originator</span>}</div><p className="mt-1 text-[9px] text-[#075BE5]">{author.role || author.position || author.organization || "Research contributor"}</p></div></div>
        <p className="mt-4 line-clamp-3 min-h-10 text-[10px] leading-5 text-[#667085]">{author.bio || "No biography added."}</p>
        <div className="mt-4 flex justify-end gap-1"><button onClick={() => setEditing({ ...author, expertiseText: (author.expertise || []).join(", ") })} className="p-2 text-[#667085] hover:text-[#075BE5]" aria-label={`Edit ${author.name}`}><Pencil className="size-4" /></button><button onClick={() => remove(author.id)} className="p-2 text-[#667085] hover:text-red-600" aria-label={`Deactivate ${author.name}`}><Trash2 className="size-4" /></button></div>
      </article>)}
    </div>

    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={() => setEditing(null)}>
      <div className="w-full max-w-[560px] rounded-[16px] bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><div><h3 className="text-[18px] font-bold">{editing.id ? "Edit author" : editing.is_external ? "Add report originator" : "Add CDS author"}</h3><p className="mt-1 text-[10px] text-[#667085]">Keep attribution details short.</p></div><button onClick={() => setEditing(null)} aria-label="Close"><X className="size-5" /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Author type</Label><select value={editing.is_external ? "external" : "internal"} onChange={(event) => setEditing({ ...editing, is_external: event.target.value === "external" })} className={`${input} mt-2`}><option value="internal">CDS Space contributor</option><option value="external">Report originator</option></select></div>
          <div><Label>Name</Label><input value={editing.name || ""} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className={`${input} mt-2`} placeholder="Full name" /></div>
          <div><Label>Role or title</Label><input value={editing.role || ""} onChange={(event) => setEditing({ ...editing, role: event.target.value })} className={`${input} mt-2`} placeholder="Author, analyst, founder…" /></div>
          {editing.is_external && <><div><Label>Organisation</Label><input value={editing.organization || ""} onChange={(event) => setEditing({ ...editing, organization: event.target.value })} className={`${input} mt-2`} placeholder="Company or publication" /></div><div><Label>Profile URL</Label><input type="url" value={editing.profile_url || ""} onChange={(event) => setEditing({ ...editing, profile_url: event.target.value })} className={`${input} mt-2`} placeholder="https://" /></div></>}
          <div className="sm:col-span-2"><Label>Short bio <span className="normal-case">(optional)</span></Label><textarea value={editing.bio || ""} onChange={(event) => setEditing({ ...editing, bio: event.target.value })} maxLength={500} className={`${textarea} mt-2 min-h-20`} placeholder="One or two sentences." /></div>
        </div>
        <button onClick={save} className="mt-5 w-full rounded-[8px] bg-[#075BE5] py-3 text-[11px] font-semibold text-white">Save author</button>
      </div>
    </div>}
  </div>;
}

function TaxonomyManager({ initialKind }: { initialKind: "category" | "tag" }) {
  const [data, setData] = useState<any>({ categories: [], tags: [], series: [] }); const [kind, setKind] = useState<"category" | "tag" | "series">(initialKind); const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const load = useCallback(() => { fetch("/api/admin/intelligence/taxonomy", { cache: "no-store", credentials: "include" }).then((r) => r.json()).then(setData); }, []); useEffect(load, [load]);
  const items = kind === "category" ? data.categories || [] : kind === "tag" ? data.tags || [] : data.series || [];
  async function add() { if (!name.trim()) return; const response = await fetch("/api/admin/intelligence/taxonomy", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, name, description }) }); const json = await response.json(); if (!response.ok) appAlert(json.error || "Could not add taxonomy"); else { setName(""); setDescription(""); load(); } }
  async function remove(id: string) { await fetch(`/api/admin/intelligence/taxonomy?kind=${kind}&id=${id}`, { method: "DELETE", credentials: "include" }); load(); }
  return <div className="max-w-[980px]"><div className="grid gap-5 lg:grid-cols-[320px_1fr]"><section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="grid grid-cols-3 gap-1 rounded-[8px] bg-[#F2F4F8] p-1">{(["category", "tag", "series"] as const).map((value) => <button key={value} onClick={() => setKind(value)} className={`rounded-[4px] px-2 py-2 text-[9px] font-semibold capitalize ${kind === value ? "bg-white text-[#075BE5] shadow-sm" : "text-[#667085]"}`}>{value}</button>)}</div><input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${kind} name`} className={`${input} mt-5`} />{kind !== "tag" && <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className={`${textarea} mt-3`} />}<button onClick={add} className="mt-3 w-full rounded-[8px] bg-[#075BE5] py-3 text-[10px] font-semibold text-white">Add {kind}</button></section><section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-[#EDF1F7] px-5 py-4 text-[11px] font-bold capitalize">{kind}s</div><div className="divide-y divide-[#EDF1F7]">{items.map((item: any) => <div key={item.id} className="flex items-center justify-between px-5 py-4"><div><p className="text-[11px] font-semibold">{item.name}</p><p className="mt-1 text-[9px] text-[#98A2B3]">/{item.slug}{item.is_active === false ? " · inactive" : ""}</p></div><button onClick={() => remove(item.id)} className="p-2 text-[#98A2B3] hover:text-red-600"><Trash2 className="size-4" /></button></div>)}{items.length === 0 && <p className="p-8 text-center text-[10px] text-[#98A2B3]">No {kind}s yet.</p>}</div></section></div></div>;
}

function SettingsManager() {
  const [settings, setSettings] = useState<any[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/admin/intelligence/settings", { cache: "no-store", credentials: "include" }).then((r) => r.json()).then((j) => setSettings(j.settings || [])); }, []);
  async function save() { setBusy(true); try { for (const setting of settings) await fetch("/api/admin/intelligence/settings", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(setting) }); appToast("Intelligence settings saved"); } finally { setBusy(false); } }
  function update(index: number, key: string, value: unknown) { setSettings((current) => current.map((setting, itemIndex) => itemIndex === index ? { ...setting, value: { ...setting.value, [key]: value } } : setting)); }
  return <div className="max-w-[900px]"><div className="space-y-4">{settings.map((setting, index) => <section key={setting.key} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><h3 className="text-[13px] font-bold capitalize">{setting.key}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(setting.value || {}).map(([key, value]) => typeof value === "boolean" ? <Toggle key={key} label={key.replaceAll(/([A-Z])/g, " $1")} checked={value} onChange={(next) => update(index, key, next)} /> : <label key={key}><span className="text-[9px] capitalize text-[#667085]">{key.replaceAll(/([A-Z])/g, " $1")}</span><input value={String(value)} onChange={(e) => update(index, key, Number.isFinite(Number(value)) ? Number(e.target.value) : e.target.value)} className={`${input} mt-1`} /></label>)}</div></section>)}</div><button onClick={save} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-[8px] bg-[#075BE5] px-5 py-3 text-[11px] font-semibold text-white">{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save settings</button></div>;
}
