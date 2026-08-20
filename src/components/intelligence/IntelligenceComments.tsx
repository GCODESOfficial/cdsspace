"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flag, Heart, Loader2, LogIn, MessageCircle, Reply, Send } from "lucide-react";
import { appToast } from "@/lib/app-notify";

type Comment = { id: string; parent_id: string | null; body: string; likes_count: number; edited_at: string | null; created_at: string; author_name: string | null; author_avatar: string | null };

export default function IntelligenceComments({ slug, initialCount, repliesEnabled, isSignedIn }: { slug: string; initialCount: number; repliesEnabled: boolean; isSignedIn: boolean }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(initialCount);

  const load = useCallback(() => {
    fetch(`/api/intelligence/${encodeURIComponent(slug)}/comments`, { cache: "no-store", credentials: "include" })
      .then((response) => response.json()).then((json) => {
        const nextComments = json.comments || [];
        setComments(nextComments);
        setCount(Number(json.count ?? nextComments.length));
      })
      .catch(() => setComments([])).finally(() => setLoading(false));
  }, [slug]);
  useEffect(load, [load]);
  const roots = useMemo(() => comments.filter((comment) => !comment.parent_id), [comments]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isSignedIn) { appToast("Sign in to join the discussion."); return; }
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/intelligence/${encodeURIComponent(slug)}/comments`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, parentId: replyTo?.id }) });
      const json = await response.json();
      if (response.status === 401) { appToast("Sign in to join the discussion."); return; }
      if (!response.ok) { appToast(json.error || "Could not post your comment."); return; }
      setComments((current) => [...current, json.comment]);
      setCount((current) => Number(json.count ?? current + 1));
      setBody(""); setReplyTo(null);
    } finally { setBusy(false); }
  }

  async function act(commentId: string, action: "like" | "report") {
    if (!isSignedIn) { appToast("Sign in to continue."); return; }
    const response = await fetch(`/api/intelligence/comments/${commentId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const json = await response.json();
    if (response.status === 401) return appToast("Sign in to continue.");
    if (!response.ok) return appToast(json.error || "Could not complete this action.");
    if (action === "like") setComments((current) => current.map((comment) => comment.id === commentId ? { ...comment, likes_count: json.likes } : comment));
    else appToast("Comment reported for review.");
  }

  function Item({ comment, nested = false }: { comment: Comment; nested?: boolean }) {
    const replies = comments.filter((item) => item.parent_id === comment.id);
    return <div className={nested ? "ml-8 border-l border-brand-stroke pl-4 sm:ml-12" : ""}>
      <div className="rounded-[12px] border border-brand-stroke bg-white p-4">
        <div className="flex items-start gap-3">
          {comment.author_avatar ? <img src={comment.author_avatar} alt="" className="size-9 rounded-full object-cover" /> : <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#EEF4FF] text-[12px] font-bold text-brand-blue">{(comment.author_name || "R").charAt(0)}</span>}
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2"><span className="text-[12px] font-bold text-brand-navy">{comment.author_name || "CDS Space reader"}</span><time className="text-[10px] text-brand-body/50">{new Date(comment.created_at).toLocaleDateString()}</time>{comment.edited_at && <span className="text-[9px] text-brand-body/45">edited</span>}</div><p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-brand-body">{comment.body}</p></div>
        </div>
        <div className="mt-3 flex items-center gap-3 pl-12 text-[11px] text-brand-body/60"><button onClick={() => act(comment.id, "like")} className="inline-flex items-center gap-1 hover:text-rose-600"><Heart className="size-3.5" />{comment.likes_count || "Like"}</button>{isSignedIn && repliesEnabled && !nested && <button onClick={() => setReplyTo(comment)} className="inline-flex items-center gap-1 hover:text-brand-blue"><Reply className="size-3.5" />Reply</button>}<button onClick={() => act(comment.id, "report")} className="ml-auto inline-flex items-center gap-1 hover:text-red-600"><Flag className="size-3.5" />Report</button></div>
      </div>
      {replies.length > 0 && <div className="mt-3 space-y-3">{replies.map((reply) => <Item key={reply.id} comment={reply} nested />)}</div>}
    </div>;
  }

  return <section className="mt-12" aria-labelledby="discussion-heading">
    <div className="flex items-center gap-2"><MessageCircle className="size-5 text-brand-blue" /><h2 id="discussion-heading" className="text-[20px] font-bold text-brand-navy">Discussion</h2><span aria-live="polite" className="text-[12px] text-brand-body/55">{count}</span></div>
    {isSignedIn ? <form onSubmit={submit} className="mt-5 rounded-[16px] border border-brand-stroke bg-white p-4 shadow-sm">{replyTo && <div className="mb-2 flex items-center justify-between rounded-[8px] bg-blue-50 px-3 py-2 text-[11px] text-brand-blue"><span>Replying to {replyTo.author_name || "reader"}</span><button type="button" onClick={() => setReplyTo(null)}>Cancel</button></div>}<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} rows={3} placeholder="Add a considered response…" className="w-full resize-y bg-transparent text-[13px] leading-6 text-brand-navy outline-none placeholder:text-brand-body/45" /><div className="mt-2 flex items-center justify-between border-t border-brand-stroke pt-3"><span className="text-[10px] text-brand-body/45">Be constructive. Links and reports are moderated.</span><button disabled={busy || !body.trim()} className="inline-flex items-center gap-2 rounded-[8px] bg-brand-blue px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}Post</button></div></form> : <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-[16px] border border-brand-stroke bg-white p-5 shadow-sm sm:flex-row sm:items-center"><div><p className="text-[13px] font-bold text-brand-navy">Sign in to join the discussion</p><p className="mt-1 text-[11px] leading-5 text-brand-body/60">Comments and replies are available to signed-in CDS Space users.</p></div><Link href={`/login?next=${encodeURIComponent(`/intelligence/${slug}#discussion-heading`)}`} className="inline-flex shrink-0 items-center gap-2 rounded-[8px] bg-brand-blue px-4 py-2.5 text-[12px] font-semibold text-white"><LogIn className="size-3.5" />Sign in to comment</Link></div>}
    <div className="mt-6 space-y-4">{loading ? <Loader2 className="mx-auto size-5 animate-spin text-brand-blue" /> : roots.length ? roots.map((comment) => <Item key={comment.id} comment={comment} />) : <div className="rounded-[12px] border border-dashed border-brand-stroke px-5 py-10 text-center text-[12px] text-brand-body/55">Start a useful conversation around this research.</div>}</div>
  </section>;
}
