/**
 * Shared "starlight" OG card used by every opengraph-image.tsx route segment
 * under this app. Renders a 1200×630 PNG via Next.js's ImageResponse (Satori).
 *
 * Visual language matches the homepage starlight section:
 *   - Deep navy → indigo gradient background
 *   - Soft radial blue glow top-right (the "star")
 *   - Scattered highlight dots (stars)
 *   - CDS Space wordmark top-left
 *   - Page title + description + tag chips
 *   - URL / domain bottom-left
 */
import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;
export const SITE_URL = "https://cdsspace.pro";

interface BrandCardProps {
  title: string;
  description?: string;
  tags?: string[];
  eyebrow?: string;           // small uppercase label above the title
  domainPath?: string;        // e.g. "/about" — shown bottom-left
  accentColor?: string;       // override the default blue glow colour
  coverImageUrl?: string;     // optional dark overlay hero image (used for /work/[id])
}

/**
 * Purpose-built OG card for /work/[id] — cover image is the hero, CDS chrome
 * sits as a subtle pill top-left, title + tags anchor at the bottom with a
 * navy gradient wash for readability.
 */
export function renderWorkCard({
  title,
  description,
  tags = [],
  category,
  coverImageUrl,
  workId,
}: {
  title: string;
  description?: string;
  tags?: string[];
  category?: string | null;
  coverImageUrl?: string | null;
  workId: number | string;
}): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(135deg, #040b37 0%, #0a1a6b 100%)",
        color: "#ffffff",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      {coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImageUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      {/* Navy gradient from top-middle to bottom so bottom text is readable */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(4,11,55,0.15) 0%, rgba(4,11,55,0.55) 45%, rgba(4,11,55,0.96) 100%)",
          display: "flex",
        }}
      />

      {/* CDS chrome pill top-left */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 48,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px 10px 12px",
          background: "rgba(4,11,55,0.7)",
          border: "1px solid rgba(127,181,255,0.35)",
          borderRadius: 999,
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background:
              "linear-gradient(135deg, #5ba8ff 0%, #0a4fe8 70%, #0035c1 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 16,
            color: "#ffffff",
          }}
        >
          C
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 1.2,
            display: "flex",
          }}
        >
          CDS SPACE
        </div>
      </div>

      {/* Category badge top-right */}
      {category && (
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 48,
            padding: "8px 14px",
            background: "rgba(91,168,255,0.22)",
            border: "1px solid rgba(127,181,255,0.45)",
            borderRadius: 999,
            color: "#dbeaff",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          {category}
        </div>
      )}

      {/* Bottom content block */}
      <div style={{ flex: 1, display: "flex" }} />
      <div
        style={{
          position: "relative",
          padding: "0 64px 56px 64px",
          display: "flex",
          flexDirection: "column",
          zIndex: 2,
          maxWidth: 1080,
        }}
      >
        <div
          style={{
            fontSize: title.length > 50 ? 58 : 72,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            color: "#ffffff",
            textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            display: "flex",
          }}
        >
          {title}
        </div>

        {description && (
          <div
            style={{
              fontSize: 22,
              fontWeight: 400,
              lineHeight: 1.45,
              color: "#dbeaff",
              marginTop: 18,
              maxWidth: 960,
              display: "flex",
            }}
          >
            {description}
          </div>
        )}

        <div
          style={{
            marginTop: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {tags.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {tags.slice(0, 4).map((t) => (
                <div
                  key={t}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.22)",
                    color: "#ffffff",
                    fontSize: 15,
                    fontWeight: 500,
                    display: "flex",
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
          <div
            style={{
              fontSize: 16,
              color: "#a7bcff",
              fontWeight: 500,
              display: "flex",
            }}
          >
            cdsspace.pro/work/{workId}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Deterministic pseudo-random — keeps star placement identical across renders
 * so the CDN can cache the resulting PNG.
 */
function starDots(seed: number, count: number) {
  const dots: { x: number; y: number; r: number; o: number }[] = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const x = (s / 233280) * 1200;
    s = (s * 9301 + 49297) % 233280;
    const y = (s / 233280) * 630;
    s = (s * 9301 + 49297) % 233280;
    const r = 1 + (s / 233280) * 2.5;
    s = (s * 9301 + 49297) % 233280;
    const o = 0.25 + (s / 233280) * 0.55;
    dots.push({ x, y, r, o });
  }
  return dots;
}

export function renderBrandCard({
  title,
  description,
  tags = [],
  eyebrow,
  domainPath = "/",
  accentColor = "#3f7dff",
  coverImageUrl,
}: BrandCardProps): ReactElement {
  const dots = starDots(7, 42);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background:
          "linear-gradient(135deg, #040b37 0%, #081149 50%, #0a1a6b 100%)",
        color: "#ffffff",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        padding: "64px 72px",
        overflow: "hidden",
      }}
    >
      {/* Radial starlight glow top-right */}
      <div
        style={{
          position: "absolute",
          top: -240,
          right: -200,
          width: 780,
          height: 780,
          borderRadius: "50%",
          background: `radial-gradient(circle at center, ${accentColor}cc 0%, ${accentColor}55 35%, transparent 70%)`,
          filter: "blur(20px)",
          display: "flex",
        }}
      />
      {/* Softer counter-glow bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: -180,
          left: -120,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at center, #5ba8ff33 0%, transparent 70%)",
          filter: "blur(30px)",
          display: "flex",
        }}
      />
      {/* Scattered stars */}
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: d.x,
            top: d.y,
            width: d.r * 2,
            height: d.r * 2,
            borderRadius: "50%",
            background: "#dbeaff",
            opacity: d.o,
            display: "flex",
          }}
        />
      ))}

      {/* Cover image overlay (used for /work/[id]) */}
      {coverImageUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImageUrl}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.35,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(4,11,55,0.35) 0%, rgba(4,11,55,0.95) 100%)",
              display: "flex",
            }}
          />
        </>
      )}

      {/* Logo wordmark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          zIndex: 2,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background:
              "linear-gradient(135deg, #5ba8ff 0%, #0a4fe8 60%, #0035c1 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: -0.5,
            boxShadow: "0 8px 24px rgba(10,79,232,0.45)",
          }}
        >
          C
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 1.5,
            color: "#ffffff",
            display: "flex",
          }}
        >
          CDS SPACE
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1, display: "flex" }} />

      {/* Main content */}
      <div style={{ display: "flex", flexDirection: "column", zIndex: 2, maxWidth: 1000 }}>
        {eyebrow && (
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: 3,
              color: "#7fb5ff",
              textTransform: "uppercase",
              marginBottom: 16,
              display: "flex",
            }}
          >
            {eyebrow}
          </div>
        )}

        <div
          style={{
            fontSize: title.length > 60 ? 60 : 72,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            color: "#ffffff",
            textShadow: "0 4px 30px rgba(5,14,70,0.6)",
            display: "flex",
          }}
        >
          {title}
        </div>

        {description && (
          <div
            style={{
              fontSize: 24,
              fontWeight: 400,
              lineHeight: 1.45,
              color: "#c3d3ff",
              marginTop: 22,
              maxWidth: 900,
              display: "flex",
            }}
          >
            {description}
          </div>
        )}

        {tags.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 28,
            }}
          >
            {tags.slice(0, 5).map((t) => (
              <div
                key={t}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  background: "rgba(91,168,255,0.14)",
                  border: "1px solid rgba(127,181,255,0.38)",
                  color: "#dbeaff",
                  fontSize: 16,
                  fontWeight: 500,
                  display: "flex",
                }}
              >
                {t}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer URL */}
      <div
        style={{
          marginTop: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontSize: 18,
            color: "#9fb8ff",
            fontWeight: 500,
            display: "flex",
          }}
        >
          cdsspace.pro{domainPath === "/" ? "" : domainPath}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "#6a82c7",
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 600,
            display: "flex",
          }}
        >
          Branding · Design · Build
        </div>
      </div>
    </div>
  );
}
