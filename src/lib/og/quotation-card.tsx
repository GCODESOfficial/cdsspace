/* eslint-disable @next/next/no-img-element */
import type { ReactElement } from "react";
import { getMetadataBgDataUri, getCdsLogoDataUri, OG_SIZE } from "./brand-card";

export interface QuotationCardProps {
    quotationNumber: string;
    projectName: string;
    clientName: string;
    status: "draft" | "sent" | "accepted" | "converted" | "cancelled";
}

const STATUS_STYLES: Record<
    QuotationCardProps["status"],
    { bg: string; fg: string; label: string }
> = {
    draft: { bg: "#e2e8f0", fg: "#0D1B39", label: "Draft" },
    sent: { bg: "#eef2ff", fg: "#0D1B39", label: "Sent" },
    accepted: { bg: "#d1fae5", fg: "#065f46", label: "Accepted" },
    converted: { bg: "#ede9fe", fg: "#5b21b6", label: "Converted" },
    cancelled: { bg: "#e2e8f0", fg: "#475569", label: "Cancelled" },
};

const GLOBE_ICON =
    "data:image/svg+xml;base64," +
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>`,
        "utf8",
    ).toString("base64");

export function renderQuotationCard(p: QuotationCardProps): ReactElement {
    const bgDataUri = getMetadataBgDataUri();
    const logoDataUri = getCdsLogoDataUri();
    const status = STATUS_STYLES[p.status] ?? STATUS_STYLES.sent;
    const number = p.quotationNumber.toUpperCase();
    const titleSize = number.length > 22 ? 65 : number.length > 16 ? 80 : 95;

    return (
        <div
            style={{
                width: OG_SIZE.width,
                height: OG_SIZE.height,
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                color: "#ffffff",
                fontFamily: "Inter, system-ui, -apple-system, sans-serif",
                padding: "65px 72px",
                background: "#040b37",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: OG_SIZE.width,
                    height: OG_SIZE.height,
                    display: "flex",
                    background: "linear-gradient(135deg, #040b37 0%, #081149 55%, #0a1a6b 100%)",
                }}
            />
            {bgDataUri ? (
                <img
                    src={bgDataUri}
                    alt=""
                    width={OG_SIZE.width}
                    height={OG_SIZE.height}
                    style={{ position: "absolute", top: 0, left: 0, width: OG_SIZE.width, height: OG_SIZE.height }}
                />
            ) : null}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {logoDataUri ? (
                    <img src={logoDataUri} alt="CDS Space - Branding Agency" width={190} height={73} style={{ display: "block" }} />
                ) : (
                    <div style={{ fontSize: 26, fontWeight: 800, color: "#ffffff", display: "flex" }}>CDS SPACE</div>
                )}
                <div
                    style={{
                        padding: "12px 26px",
                        borderRadius: 999,
                        background: status.bg,
                        color: status.fg,
                        fontSize: 22,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        display: "flex",
                    }}
                >
                    {status.label}
                </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
                <div
                    style={{
                        fontSize: titleSize,
                        fontWeight: 800,
                        lineHeight: 1.05,
                        color: "#ffffff",
                        textShadow: "0 4px 40px rgba(4,11,55,0.45)",
                        display: "flex",
                    }}
                >
                    {number}
                </div>
                <div style={{ fontSize: 27, fontWeight: 500, lineHeight: 1.35, color: "#ffffff", opacity: 0.88, marginTop: 20, display: "flex" }}>
                    {p.projectName} for {p.clientName}
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, color: "#fbbf24", opacity: 0.95, marginTop: 12, display: "flex" }}>
                    Rough project estimate
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={GLOBE_ICON} alt="" width={30} height={30} />
                <div style={{ fontSize: 25, fontWeight: 600, color: "#ffffff", opacity: 0.92, display: "flex" }}>
                    cdsspace.com | cdsspace.pro
                </div>
            </div>
        </div>
    );
}
