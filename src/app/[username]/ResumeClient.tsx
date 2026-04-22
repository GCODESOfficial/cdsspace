"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Briefcase, GraduationCap, UserRound, MapPin, ExternalLink, Loader2 } from "lucide-react";

interface Member {
  id: string;
  full_name: string;
  username: string;
  role_title: string | null;
  department: string | null;
  avatar_url: string | null;
}

interface Resume {
  headline: string;
  about: string;
  avatar_url: string | null;
  location: string;
  website: string;
  email_public: string;
  socials: { x?: string; github?: string; linkedin?: string; telegram?: string };
  skills: string[];
  past_roles: { company: string; title: string; start: string; end: string; description: string }[];
  projects: { name: string; client: string; role: string; year: string; link: string; description: string }[];
  education: { school: string; degree: string; start: string; end: string }[];
}

export default function PublicResumePage() {
  const params = useParams<{ username: string }>();
  const [member, setMember] = useState<Member | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "suspended">("loading");

  useEffect(() => {
    if (!params?.username) return;
    (async () => {
      const r = await fetch(`/api/resume/${params.username}`);
      if (!r.ok) { setState("notfound"); return; }
      const j = await r.json();
      if (j.suspended) { setState("suspended"); return; }
      setMember(j.member);
      setResume(j.resume);
      setState("ok");
    })();
  }, [params?.username]);

  if (state === "loading") return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></div>;
  if (state === "notfound") return <div className="min-h-screen flex items-center justify-center text-gray-500 p-6 text-center">Profile not found or not published yet.</div>;
  if (state === "suspended") return <div className="min-h-screen flex items-center justify-center text-gray-500 p-6 text-center">This profile is currently unavailable.</div>;
  if (!member || !resume) return null;

  const avatar = resume.avatar_url || member.avatar_url;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[820px] mx-auto px-6 py-10">
        <header className="flex items-start gap-5">
          {avatar ? (
            <img src={avatar} alt={member.full_name} className="w-24 h-24 rounded-full object-cover border border-gray-200" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center"><UserRound className="w-10 h-10" /></div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#0A4FE8] font-semibold">CDS Space · cResume</p>
            <h1 className="text-[24px] font-bold text-[#0D1B39] mt-1">{member.full_name}</h1>
            {resume.headline && <p className="text-[14px] text-gray-600 mt-1">{resume.headline}</p>}
            <p className="text-[12px] text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
              {member.role_title && <span>{member.role_title}</span>}
              {member.department && <span>· {member.department}</span>}
              {resume.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {resume.location}</span>}
            </p>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-[11.5px]">
              {resume.website && <a href={resume.website.startsWith("http") ? resume.website : `https://${resume.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#0A4FE8] hover:underline"><ExternalLink className="w-3 h-3" /> Website</a>}
              {resume.socials.x && <a href={`https://x.com/${resume.socials.x.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="text-[#0A4FE8] hover:underline">X</a>}
              {resume.socials.linkedin && <a href={resume.socials.linkedin} target="_blank" rel="noreferrer" className="text-[#0A4FE8] hover:underline">LinkedIn</a>}
              {resume.socials.github && <a href={`https://github.com/${resume.socials.github.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="text-[#0A4FE8] hover:underline">GitHub</a>}
              {resume.socials.telegram && <a href={`https://t.me/${resume.socials.telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="text-[#0A4FE8] hover:underline">Telegram</a>}
            </div>
          </div>
        </header>

        {resume.about && (
          <section className="mt-8">
            <p className="text-[14px] leading-relaxed text-[#0D1B39]">{resume.about}</p>
          </section>
        )}

        {resume.skills.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Skills</h2>
            <div className="flex flex-wrap gap-1.5">
              {resume.skills.map((s) => <span key={s} className="px-2.5 py-1 rounded-lg bg-[#0A4FE8]/5 text-[#0A4FE8] text-[11.5px]">{s}</span>)}
            </div>
          </section>
        )}

        {resume.past_roles.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2 flex items-center gap-1.5"><Briefcase className="w-3 h-3" /> Experience</h2>
            <ul className="space-y-4">
              {resume.past_roles.map((r, i) => (
                <li key={i}>
                  <p className="text-[13px] font-semibold text-[#0D1B39]">{r.title}<span className="text-gray-500 font-normal"> · {r.company}</span></p>
                  <p className="text-[11.5px] text-gray-400">{r.start}{r.end && ` → ${r.end}`}</p>
                  {r.description && <p className="text-[12.5px] text-gray-600 mt-1">{r.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {resume.projects.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Projects</h2>
            <ul className="space-y-4">
              {resume.projects.map((p, i) => (
                <li key={i}>
                  <p className="text-[13px] font-semibold text-[#0D1B39]">{p.name}{p.client && <span className="text-gray-500 font-normal"> · {p.client}</span>}</p>
                  <p className="text-[11.5px] text-gray-400">{p.role}{p.year && ` · ${p.year}`}</p>
                  {p.description && <p className="text-[12.5px] text-gray-600 mt-1">{p.description}</p>}
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="text-[11.5px] text-[#0A4FE8] hover:underline">{p.link}</a>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {resume.education.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2 flex items-center gap-1.5"><GraduationCap className="w-3 h-3" /> Education</h2>
            <ul className="space-y-3">
              {resume.education.map((e, i) => (
                <li key={i}>
                  <p className="text-[13px] font-semibold text-[#0D1B39]">{e.degree}<span className="text-gray-500 font-normal"> · {e.school}</span></p>
                  <p className="text-[11.5px] text-gray-400">{e.start}{e.end && ` → ${e.end}`}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 pt-6 border-t border-gray-100 text-center text-[11px] text-gray-400">
          Made with ✨ on <Link href="/" className="text-[#0A4FE8] hover:underline">CDS Space</Link> · cResume
        </footer>
      </div>
    </div>
  );
}
