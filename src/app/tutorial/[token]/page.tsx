import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, LogIn, PlayCircle } from "lucide-react";
import { getPublicTutorialSummary } from "@/lib/tutorials";
import { tutorialTargetLabel } from "@/lib/tutorial-targets";
import { absolutePublicUrl } from "@/lib/public-site";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

/**
 * The preview card a shared tutorial link produces in chat apps and on social.
 * The tutorial's own title and description fill it, the same way the sign-in
 * link shows "Welcome back to CDS Space".
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const tutorial = await getPublicTutorialSummary(token).catch(() => null);
  const title = tutorial ? `${tutorial.title} · CDS Space Tutorial` : "Tutorial · CDS Space";
  const description = tutorial?.description
    || "A step-by-step CDS Space tutorial. Sign in to watch it in your account.";
  const url = absolutePublicUrl(`/tutorial/${tutorial?.public_token || token}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    // Shareable, but not something search engines should index: it is client
    // learning material, not marketing. Preview cards still render.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url,
      type: "video.other",
      siteName: "CDS Space",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicTutorialPage({ params }: { params: Params }) {
  const { token } = await params;
  const tutorial = await getPublicTutorialSummary(token).catch(() => null);
  if (!tutorial) notFound();

  // The video itself stays behind the account: this page is the invitation.
  const watchHref = `/login?next=${encodeURIComponent("/dashboard/tutorials")}`;
  const tags = tutorial.tags?.length ? tutorial.tags : [tutorial.tool_slug];

  return (
    <main className="min-h-screen bg-[#F5F8FF] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-[#DCE5F5] bg-white shadow-sm">
        <div className="bg-[#0A4FE8] px-6 py-10 text-white sm:px-10">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-blue-100">
            <BookOpen className="h-4 w-4" /> CDS Space tutorial
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">{tutorial.title}</h1>
          {tutorial.description && (
            <p className="mt-3 max-w-xl text-[14px] leading-6 text-blue-100">{tutorial.description}</p>
          )}
        </div>

        <div className="px-6 py-7 sm:px-10">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-semibold text-slate-600">
                {tutorialTargetLabel(tag)}
              </span>
            ))}
          </div>

          <p className="mt-5 text-[13.5px] leading-6 text-[#475467]">
            This tutorial plays inside your CDS Space account, with captions and audio in eight languages.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={watchHref} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13px] font-semibold text-white hover:bg-[#083EC0]">
              <PlayCircle className="h-4 w-4" /> Sign in to watch
            </Link>
            <Link href="/signup" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#DCE5F5] px-5 text-[13px] font-semibold text-[#07133B] hover:bg-[#F5F8FF]">
              <LogIn className="h-4 w-4" /> Create an account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
