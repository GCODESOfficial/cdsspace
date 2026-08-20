import { FileText, ShieldCheck } from "lucide-react";
import { isPdfUrl } from "@/lib/work-asset";

/**
 * Renders a single portfolio asset:
 *  - images → <img>
 *  - PDFs   → a protected-document notice (never sends the source PDF to the
 *             public browser)
 *
 * Portfolio PDFs previously used the browser's native viewer, whose toolbar and
 * network request exposed a direct download path. Public marketing pages now
 * withhold the source document and show a request-only notice instead.
 */
export default function WorkAsset({ url, alt }: { url: string; alt?: string }) {
    if (isPdfUrl(url)) {
        return (
            <div
                data-cds-protected-document
                className="flex min-h-[220px] flex-col items-center justify-center gap-3 bg-[#F4F6FB] px-6 text-center"
                role="note"
                aria-label={`${alt || "Project"} document is protected`}
            >
                <div className="relative grid h-12 w-12 place-items-center rounded-[12px] bg-white text-[#0A4FE8] shadow-sm">
                    <FileText className="h-6 w-6" aria-hidden="true" />
                    <ShieldCheck
                        className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#0A4FE8] p-1 text-white"
                        aria-hidden="true"
                    />
                </div>
                <p className="font-semibold text-[#040B37]">Protected project document</p>
                <p className="max-w-md text-sm leading-6 text-[#667085]">
                    The source document is not distributed from the public portfolio. Contact CDS Space for an authorised viewing.
                </p>
            </div>
        );
    }

    return (
        <div data-cds-work-preview className="relative w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={url}
                alt={alt || ""}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="block h-auto w-full"
            />
        </div>
    );
}
