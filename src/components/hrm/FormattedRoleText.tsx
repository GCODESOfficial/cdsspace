import type { ReactNode } from "react";

function isSafeHref(value: string) {
  return /^(https?:\/\/|mailto:)/i.test(value.trim());
}

function parseInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2]) {
      nodes.push(<strong key={`${match.index}-b`} className="font-semibold text-[#0D1B39]">{match[2]}</strong>);
    } else {
      const label = match[3] || "";
      const href = match[4] || "";
      nodes.push(isSafeHref(href)
        ? (
          <a key={`${match.index}-a`} href={href} target="_blank" rel="noreferrer" className="font-medium text-[#0A4FE8] underline underline-offset-2">
            {label}
          </a>
        )
        : label);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export default function FormattedRoleText({ value, className = "" }: { value?: string | null; className?: string }) {
  const lines = String(value || "").split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    const current = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
        {current.map((item, index) => <li key={`${item}-${index}`}>{parseInline(item)}</li>)}
      </ul>,
    );
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      return;
    }
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets();
    blocks.push(<p key={`p-${index}`} className="my-2">{parseInline(trimmed)}</p>);
  });
  flushBullets();

  if (!blocks.length) return null;
  return <div className={`text-sm leading-6 text-gray-600 ${className}`}>{blocks}</div>;
}
