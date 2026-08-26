/**
 * Pricing OG card. Same metabg.png plate + mlogo.svg lockup as the rest of
 * the brand metadata, but fills the top of the plate with an actual
 * pricelist: the packages and their prices for the requested currency.
 *
 * Layout (1200×630, kept in sync with brand-card.tsx / invoice-card.tsx):
 *   - Logo top-left, "Pricing · <CUR>" pill top-right
 *   - Left column: title + market line + tagline + effective date
 *   - Right column: white panel listing packages with prices (max 6 rows)
 *   - Globe footer with cdsspace.pro
 */
import type { ReactElement } from "react";
import { getMetadataBgDataUri, getCdsLogoDataUri, OG_SIZE } from "./brand-card";
import {
    CURRENCIES,
    formatPrice,
    formatCell,
    marketFor,
    type CurrencyCode,
    type PricingListData,
} from "@/lib/pricing/types";

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

/** Trim a package name so each panel row stays on one line. */
function shortName(name: string): string {
    return name.length > 30 ? name.replace(/\s*\+\s*/g, " + ").slice(0, 29).trim() + "…" : name;
}

export function renderPricingCard(list: PricingListData, currency: CurrencyCode): ReactElement {
    const bgDataUri = getMetadataBgDataUri();
    const logoDataUri = getCdsLogoDataUri();
    const meta = CURRENCIES[currency];
    const market = marketFor(list, currency);
    // Rows for the panel: package name/price, or matrix row label + first option's price.
    const firstVariant = list.matrix?.variants[0];
    const rows: { key: string; name: string; price: string }[] =
        list.kind === "matrix" && list.matrix
            ? list.matrix.rows.slice(0, 6).map((r, i) => ({
                  key: String(i),
                  name: shortName(r.label),
                  price: formatCell(firstVariant ? r.cells[firstVariant.id] : undefined, currency),
              }))
            : list.packages.slice(0, 6).map((p) => ({
                  key: p.id,
                  name: shortName(p.name),
                  price: formatPrice(p.price, currency),
              }));
    const titleSize = list.title.length > 34 ? 44 : list.title.length > 24 ? 50 : 56;

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
                padding: "58px 66px",
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
                    background: "linear-gradient(135deg, #0035C1 0%, #0047d4 55%, #0575FF 100%)",
                }}
            />
            {bgDataUri ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={bgDataUri}
                    alt=""
                    width={OG_SIZE.width}
                    height={OG_SIZE.height}
                    style={{ position: "absolute", top: 0, left: 0, width: OG_SIZE.width, height: OG_SIZE.height }}
                />
            ) : null}

            {/* Top row: logo + currency pill */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {logoDataUri ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={logoDataUri} alt="CDS Space" width={176} height={68} style={{ display: "block" }} />
                ) : (
                    <div style={{ fontSize: 26, fontWeight: 800, color: "#ffffff", display: "flex" }}>CDS SPACE</div>
                )}
                <div
                    style={{
                        padding: "11px 24px",
                        borderRadius: 999,
                        background: "#ffffff",
                        color: "#040B37",
                        fontSize: 21,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        display: "flex",
                    }}
                >
                    {`Pricing · ${meta.symbol}`}
                </div>
            </div>

            {/* Main: title (left) + pricelist panel (right) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40 }}>
                <div style={{ display: "flex", flexDirection: "column", width: 400 }}>
                    <div
                        style={{
                            fontSize: titleSize,
                            fontWeight: 800,
                            lineHeight: 1.04,
                            letterSpacing: -1.4,
                            color: "#ffffff",
                            textShadow: "0 4px 40px rgba(4,11,55,0.45)",
                            display: "flex",
                        }}
                    >
                        {list.title}
                    </div>
                    <div style={{ fontSize: 23, fontWeight: 600, color: "#ffffff", opacity: 0.92, marginTop: 18, display: "flex" }}>
                        {`${market} · ${meta.name}`}
                    </div>
                    {list.tagline ? (
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", marginTop: 20, display: "flex" }}>
                            {list.tagline}
                        </div>
                    ) : null}
                    {list.effectiveDate ? (
                        <div style={{ fontSize: 18, fontWeight: 500, color: "#ffffff", opacity: 0.75, marginTop: 8, display: "flex" }}>
                            {`Effective ${list.effectiveDate}`}
                        </div>
                    ) : null}
                </div>

                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        width: 596,
                        background: "rgba(255,255,255,0.97)",
                        borderRadius: 22,
                        padding: "22px 26px",
                        boxShadow: "0 20px 60px rgba(4,11,55,0.35)",
                    }}
                >
                    {rows.map((row, i) => (
                        <div
                            key={row.key}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                paddingTop: i === 0 ? 0 : 13,
                                paddingBottom: 13,
                                borderBottom: i === rows.length - 1 ? "0px solid transparent" : "1px solid #E3E8F4",
                            }}
                        >
                            <div style={{ fontSize: 21, fontWeight: 600, color: "#040B37", display: "flex" }}>
                                {row.name}
                            </div>
                            <div style={{ fontSize: 21, fontWeight: 800, color: "#1C4ED1", display: "flex", whiteSpace: "nowrap" }}>
                                {row.price}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={GLOBE_ICON} alt="" width={28} height={28} />
                <div style={{ fontSize: 23, fontWeight: 600, color: "#ffffff", opacity: 0.92, display: "flex" }}>
                    cdsspace.pro
                </div>
            </div>
        </div>
    );
}
