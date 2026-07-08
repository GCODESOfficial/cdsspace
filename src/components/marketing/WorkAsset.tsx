import { FileText, ExternalLink } from "lucide-react";
import { isPdfUrl, safeEmbedUrl } from "@/lib/work-asset";

/**
 * Renders a single portfolio asset:
 *  - images → <img>
 *  - PDFs   → sandboxed <iframe> (the browser's native PDF viewer)
 *
 * The iframe is hardened against src injection: the URL must pass the host
 * allowlist in `safeEmbedUrl`, and the frame is sandboxed WITHOUT `allow-scripts`
 * so a framed document can never run JavaScript. `allow-same-origin` is safe
 * here because the asset host differs from the app origin, so the frame gets its
 * own origin and cannot reach our DOM. Unsafe URLs degrade to a plain link.
 */
export default function WorkAsset({ url, alt }: { url: string; alt?: string }) {
  if (isPdfUrl(url)) {
    const safe = safeEmbedUrl(url);
    if (!safe) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#0A4FE8] hover:underline"
        >
          <FileText className="w-4 h-4" /> Open document <ExternalLink className="w-3.5 h-3.5" />
        </a>
      );
    }
    return (
      <iframe
        src={safe}
        title={alt || "Project document"}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="block w-full h-[80vh] min-h-[480px] bg-white"
      />
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={url} alt={alt || ""} loading="lazy" className="w-full h-auto block" />
  );
}
