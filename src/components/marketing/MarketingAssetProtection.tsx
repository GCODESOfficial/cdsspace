"use client";

import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const PROTECTED_MEDIA_SELECTOR =
    "img, video, canvas, [data-cds-work-preview], [data-cds-protected-document]";

function closestElement(target: EventTarget | null): Element | null {
    if (target instanceof Element) return target;
    if (target instanceof Node) return target.parentElement;
    return null;
}

function isProtectedMedia(target: EventTarget | null): boolean {
    return Boolean(closestElement(target)?.closest(PROTECTED_MEDIA_SELECTOR));
}

function hardenMedia(root: ParentNode) {
    root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
        image.draggable = false;
        image.setAttribute("draggable", "false");
    });

    root.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
        video.draggable = false;
        video.setAttribute("draggable", "false");
        video.setAttribute("controlslist", "nodownload noremoteplayback");
        video.disablePictureInPicture = true;
        video.disableRemotePlayback = true;
        video.setAttribute("disablepictureinpicture", "");
        video.setAttribute("disableremoteplayback", "");
    });
}

/**
 * Browser-side deterrence for media shown on public marketing pages.
 *
 * A public browser must receive an asset in order to display it, so no client
 * script can make copying mathematically impossible. This guard removes the
 * standard save/drag/long-press paths while leaving the displayed artwork
 * unobstructed, and preserving normal links, scrolling and assistive technology.
 */
export function MarketingAssetProtection() {
    const [noticeVisible, setNoticeVisible] = useState(false);
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showNotice = useCallback(() => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        setNoticeVisible(true);
        noticeTimer.current = setTimeout(() => setNoticeVisible(false), 2400);
    }, []);

    useEffect(() => {
        const body = document.body;
        body.dataset.cdsMarketingSite = "true";
        hardenMedia(body);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;
                    if (node.matches("img, video")) hardenMedia(node.parentNode ?? body);
                    hardenMedia(node);
                });
            });
        });
        observer.observe(body, { childList: true, subtree: true });

        const preventMediaAction = (event: Event) => {
            if (!isProtectedMedia(event.target)) return;
            event.preventDefault();
            showNotice();
        };

        const preventSaveShortcut = (event: KeyboardEvent) => {
            const saveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
            if (!saveShortcut) return;
            event.preventDefault();
            showNotice();
        };

        document.addEventListener("contextmenu", preventMediaAction, true);
        document.addEventListener("dragstart", preventMediaAction, true);
        document.addEventListener("keydown", preventSaveShortcut, true);

        return () => {
            observer.disconnect();
            document.removeEventListener("contextmenu", preventMediaAction, true);
            document.removeEventListener("dragstart", preventMediaAction, true);
            document.removeEventListener("keydown", preventSaveShortcut, true);
            delete body.dataset.cdsMarketingSite;
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
        };
    }, [showNotice]);

    return (
        <>
            <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={`pointer-events-none fixed bottom-5 left-1/2 z-[500] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-[12px] border border-white/15 bg-[#040B37]/95 px-4 py-3 text-sm font-medium text-white shadow-2xl backdrop-blur transition duration-200 sm:left-6 sm:translate-x-0 ${
                    noticeVisible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
            >
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#65A3FF]" aria-hidden="true" />
                CDS Space marketing assets are protected.
            </div>

            <style jsx global>{`
                body[data-cds-marketing-site="true"] img,
                body[data-cds-marketing-site="true"] video,
                body[data-cds-marketing-site="true"] canvas,
                body[data-cds-marketing-site="true"] [data-cds-work-preview] {
                    -webkit-touch-callout: none;
                    -webkit-user-drag: none;
                    user-drag: none;
                    user-select: none;
                }

                @media print {
                    body[data-cds-marketing-site="true"] [data-cds-work-preview] img,
                    body[data-cds-marketing-site="true"] [data-cds-work-preview] video,
                    body[data-cds-marketing-site="true"] [data-cds-work-preview] iframe {
                        visibility: hidden !important;
                    }

                }
            `}</style>
        </>
    );
}
