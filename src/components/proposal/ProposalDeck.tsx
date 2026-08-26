/**
 * Landscape CDS Space proposal deck.
 *
 * Nine 16:9 slides rendered from the shared deck model, used by the public
 * proposal link and by the admin live preview. Type sizes are expressed in
 * container query units so a slide reads identically at any width.
 *
 * Decorative artwork comes from the standalone illustrations in
 * /public/proposal-svg, with one window still cropped out of an approved deck
 * export in /public/proposal.
 */
import {
  PROCESS_PAYOFF,
  PROCESS_PROBLEMS,
  PROCESS_STAGES,
  PROPOSAL_ART,
  SLIDE_SOURCE_HEIGHT,
  SLIDE_SOURCE_WIDTH,
  type ProposalArtKey,
  type ProposalDeck as Deck,
} from "@/lib/proposal-deck";

const BLUE = "#0050DB";
const DEEP = "#003BA6";
const INK = "#07133B";

function Art({ art, className, style }: { art: ProposalArtKey; className?: string; style?: React.CSSProperties }) {
  const source = PROPOSAL_ART[art];
  const src = encodeURI(`/${source.src}`);
  const crop = "crop" in source ? source.crop : undefined;

  return (
    <div className={className} style={{ position: "absolute", overflow: "hidden", pointerEvents: "none", ...style }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        style={crop
          ? {
            // Cropped window onto a full slide export.
            position: "absolute",
            width: `${(SLIDE_SOURCE_WIDTH / source.w) * 100}%`,
            height: `${(SLIDE_SOURCE_HEIGHT / source.h) * 100}%`,
            maxWidth: "none",
            left: `${(-crop.x / source.w) * 100}%`,
            top: `${(-crop.y / source.h) * 100}%`,
          }
          : {
            // Standalone artwork: drawn whole and letterboxed, never stretched.
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center",
          }}
      />
    </div>
  );
}

function Slide({ children, dark = false, page, id, note }: { children: React.ReactNode; dark?: boolean; page?: number; id?: string; note?: string }) {
  return (
    <section
      id={id}
      style={{
        containerType: "inline-size",
        position: "relative",
        aspectRatio: "16 / 9",
        width: "100%",
        overflow: "hidden",
        background: dark ? BLUE : "#FFFFFF",
        color: dark ? "#FFFFFF" : INK,
        border: dark ? "none" : `1px solid ${dark ? "transparent" : "#DCE7FB"}`,
        borderRadius: "1.2cqw",
        boxShadow: "0 18px 60px rgba(7,19,59,0.10)",
        fontFamily: "var(--font-neue-campton, ui-sans-serif, system-ui, sans-serif)",
      }}
    >
      {children}
      {page ? <Footer dark={dark} page={page} note={note} /> : null}
    </section>
  );
}

function Footer({ dark, page, note }: { dark: boolean; page: number; note?: string }) {
  const line = dark ? "rgba(255,255,255,0.5)" : "#B9D0F7";
  return (
    <div style={{ position: "absolute", left: "7.2cqw", right: "7.2cqw", bottom: "4.4cqw", display: "flex", alignItems: "stretch", gap: "0.6cqw", fontSize: "1.05cqw" }}>
      {note ? (
        // A slide with its own footnote runs it in the footer row so it sits
        // beside the page number instead of landing on top of it.
        <div style={{ flex: 1, borderRadius: "0.55cqw", background: BLUE, color: "#FFFFFF", padding: "0.85cqw 1.2cqw", fontWeight: 600 }}>
          {note}
        </div>
      ) : (
      <div style={{ flex: 1, border: `1px solid ${line}`, borderRadius: "0.55cqw", padding: "0.85cqw 1.2cqw", color: dark ? "rgba(255,255,255,0.85)" : BLUE }}>
        partner with us at <strong style={{ fontWeight: 700 }}>cdsspace.pro</strong>
      </div>
      )}
      <div style={{ width: "3.2cqw", display: "grid", placeItems: "center", borderRadius: "0.55cqw", background: dark ? "#FFFFFF" : BLUE, color: dark ? BLUE : "#FFFFFF", fontWeight: 700 }}>
        {String(page).padStart(2, "0")}
      </div>
    </div>
  );
}

function Heading({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <h2 style={{ margin: 0, fontSize: "3.05cqw", lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.01em", color: dark ? "#FFFFFF" : BLUE }}>
      {children}
    </h2>
  );
}

function Bullet({ dark }: { dark: boolean }) {
  return (
    <span
      style={{
        marginTop: "0.55cqw",
        flex: "none",
        width: "0.85cqw",
        height: "0.85cqw",
        borderRadius: "999px",
        background: dark ? "#FFFFFF" : BLUE,
        opacity: dark ? 0.9 : 1,
      }}
    />
  );
}

function formatDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export interface ProposalDeckProps {
  deck: Deck;
  brandName: string;
  createdAt?: string;
  coverUrl?: string | null;
}

export function CoverSlide({ deck, brandName, createdAt, coverUrl }: ProposalDeckProps) {
  return (
    <Slide dark>
      {coverUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt={`${brandName} proposal cover`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        </>
      ) : (
        <>
          <Art art="worldMap" style={{ left: 0, right: 0, bottom: 0, height: "70%" }} />
          <div style={{ position: "absolute", top: "9cqw", left: "7.2cqw", right: "24cqw" }}>
            <h1 style={{ margin: 0, fontSize: "4.3cqw", lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.015em" }}>{deck.cover.title}</h1>
            <p style={{ margin: "1.2cqw 0 0", fontSize: "1.9cqw", lineHeight: 1.35, color: "rgba(255,255,255,0.92)" }}>{deck.cover.subtitle}</p>
          </div>
          <div style={{ position: "absolute", top: "8.4cqw", right: "7.2cqw", width: "9cqw" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mlogo.svg" alt="CDS Space" style={{ width: "100%", filter: "brightness(0) invert(1)" }} />
          </div>
          <div style={{ position: "absolute", left: "7.2cqw", bottom: "9cqw", fontSize: "1.2cqw", color: "rgba(255,255,255,0.9)" }}>
            <div style={{ fontWeight: 700 }}>Prepared for {deck.cover.prepared_for || brandName}</div>
            <div style={{ marginTop: "0.4cqw", opacity: 0.8 }}>{formatDate(createdAt)}</div>
          </div>
        </>
      )}
    </Slide>
  );
}

export function WhoWeAreSlide({ deck }: { deck: Deck }) {
  return (
    <Slide page={2}>
      <Art art="flag" style={{ right: 0, top: "4%", width: "40%", height: "78%" }} />
      <div style={{ position: "absolute", top: "8.4cqw", left: "7.2cqw", width: "50%" }}>
        <Heading>{deck.who_we_are.heading}</Heading>
        <div style={{ marginTop: "2.4cqw", display: "grid", gap: "1.2cqw", fontSize: "1.35cqw", lineHeight: 1.55, color: "#1F2A44" }}>
          {deck.who_we_are.body.map((paragraph, index) => <p key={index} style={{ margin: 0 }}>{paragraph}</p>)}
        </div>
      </div>
    </Slide>
  );
}

export function BigPictureSlide({ deck }: { deck: Deck }) {
  return (
    <Slide page={3}>
      <Art art="people" style={{ right: 0, top: "12%", width: "34%", height: "66%" }} />
      <div style={{ position: "absolute", top: "8.4cqw", left: "7.2cqw", width: "62%" }}>
        <Heading>{deck.big_picture.heading}</Heading>
        <p style={{ margin: "1.6cqw 0 0", fontSize: "1.35cqw", lineHeight: 1.55, color: "#1F2A44" }}>{deck.big_picture.intro}</p>
        <div style={{ marginTop: "2cqw", display: "grid", gap: "1cqw" }}>
          {deck.big_picture.outcomes.map((outcome, index) => (
            <div key={index} style={{ display: "flex", gap: "1cqw", alignItems: "flex-start" }}>
              <Bullet dark={false} />
              <div>
                <strong style={{ display: "block", fontSize: "1.4cqw", color: INK }}>{outcome.title}</strong>
                <span style={{ display: "block", marginTop: "0.3cqw", fontSize: "1.2cqw", lineHeight: 1.5, color: "#5C6C8B" }}>{outcome.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

export function RewindSlide({ deck }: { deck: Deck }) {
  return (
    <Slide dark page={4}>
      <Art art="puzzle" style={{ right: 0, top: 0, width: "34%", height: "78%" }} />
      <div style={{ position: "absolute", top: "8.4cqw", left: "7.2cqw", width: "57%" }}>
        <Heading dark>{deck.rewind.heading}</Heading>
        <p style={{ margin: "1.6cqw 0 0", fontSize: "1.4cqw", lineHeight: 1.55, color: "rgba(255,255,255,0.92)" }}>{deck.rewind.intro}</p>
        <div style={{ marginTop: "1.8cqw", display: "grid", gap: "0.9cqw" }}>
          {deck.rewind.problems.map((problem, index) => (
            <div key={index} style={{ display: "flex", gap: "1cqw", alignItems: "flex-start", fontSize: "1.25cqw", lineHeight: 1.5, color: "rgba(255,255,255,0.95)" }}>
              <Bullet dark />
              <span>{problem}</span>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

export function OpportunitiesSlide({ deck }: { deck: Deck }) {
  const tones = [BLUE, "#2C6BF0", "#5A8DF6", "#7FA8F8"];
  return (
    <Slide page={5}>
      <div style={{ position: "absolute", top: "8.4cqw", left: "7.2cqw", right: "7.2cqw" }}>
        <Heading>{deck.opportunities.heading}</Heading>
        <p style={{ margin: "1.2cqw 0 0", width: "62%", fontSize: "1.3cqw", lineHeight: 1.5, color: "#1F2A44" }}>{deck.opportunities.intro}</p>
        <div style={{ marginTop: "1.8cqw", display: "grid", gridTemplateColumns: deck.opportunities.items.length > 2 ? "repeat(2, 1fr)" : "1fr", gap: "0.5cqw", borderRadius: "0.9cqw", overflow: "hidden" }}>
          {deck.opportunities.items.slice(0, 4).map((item, index) => (
            <div key={index} style={{ background: tones[index % tones.length], color: "#FFFFFF", padding: "1.4cqw 1.6cqw" }}>
              <strong style={{ display: "block", fontSize: "1.35cqw" }}>{item.title}</strong>
              <span style={{ display: "block", marginTop: "0.5cqw", fontSize: "1.1cqw", lineHeight: 1.5, color: "rgba(255,255,255,0.92)" }}>{item.detail}</span>
              {item.value ? <span style={{ display: "inline-block", marginTop: "0.8cqw", padding: "0.35cqw 0.8cqw", borderRadius: "999px", background: "rgba(255,255,255,0.18)", fontSize: "0.95cqw", fontWeight: 700 }}>{item.value}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

export function ProcessSlide({ deck }: { deck: Deck }) {
  const columnHead = (title: string, caption: string, dark: boolean) => (
    <div style={{ background: dark ? BLUE : "#DCE8FC", color: dark ? "#FFFFFF" : INK, padding: "0.75cqw 0.7cqw" }}>
      <strong style={{ display: "block", fontSize: "1cqw" }}>{title}</strong>
      <span style={{ display: "block", fontSize: "0.68cqw", opacity: 0.85 }}>{caption}</span>
    </div>
  );
  const dot = (dark: boolean) => ({ marginTop: "0.32cqw", flex: "none", width: "0.4cqw", height: "0.4cqw", borderRadius: "999px", background: dark ? "#FFFFFF" : BLUE });
  const item = (label: string, key: string, dark = false) => (
    <div key={key} style={{ display: "flex", gap: "0.4cqw", alignItems: "flex-start", fontSize: "0.72cqw", lineHeight: 1.35 }}>
      <span style={dot(dark)} /><span>{label}</span>
    </div>
  );

  return (
    <Slide page={6} note={deck.process.duration_note}>
      <div style={{ position: "absolute", top: "5.2cqw", left: "4.4cqw", right: "4.4cqw" }}>
        <Heading>{deck.process.heading}</Heading>
        <p style={{ margin: "0.7cqw 0 0", fontSize: "1.1cqw", color: "#1F2A44" }}>{deck.process.intro}</p>

        <div style={{ marginTop: "1.2cqw", display: "grid", gridTemplateColumns: "0.95fr repeat(5, 1fr) 0.95fr", gap: "0.15cqw", minHeight: "34.5cqw" }}>
          <div style={{ display: "grid", gridTemplateRows: "auto 1fr", background: "#EDF3FE" }}>
            {columnHead("The Problem", "Could be but not limited to", true)}
            <div style={{ padding: "0.85cqw 0.7cqw", display: "grid", gap: "0.45cqw", alignContent: "start" }}>
              {PROCESS_PROBLEMS.map((problem) => item(problem, problem))}
            </div>
          </div>

          {PROCESS_STAGES.map((stage) => (
            <div key={stage.step} style={{ display: "grid", gridTemplateRows: "auto 1fr", background: "#F6F9FE" }}>
              {columnHead(stage.step, stage.caption, false)}
              <div style={{ padding: "0.85cqw 0.7cqw", display: "flex", flexDirection: "column" }}>
                <p style={{ margin: 0, fontSize: "0.74cqw", lineHeight: 1.4, color: "#3A4A6B" }}>{stage.summary}</p>
                <span style={{ margin: "0.65cqw 0 0.4cqw", fontSize: "0.75cqw", fontWeight: 700, color: BLUE }}>{stage.listLabel}</span>
                <div style={{ display: "grid", gap: "0.35cqw" }}>{stage.items.map((entry) => item(entry, entry))}</div>
                <div style={{ marginTop: "auto", paddingTop: "0.9cqw" }}>
                  <span style={{ display: "block", fontSize: "0.72cqw", fontWeight: 700, color: BLUE }}>Output</span>
                  <span style={{ display: "block", fontSize: "0.74cqw", lineHeight: 1.35, color: INK }}>{stage.output}</span>
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: "grid", gridTemplateRows: "auto 1fr", background: "#EDF3FE" }}>
            {columnHead("The Payoff", "True value for investment", true)}
            <div style={{ padding: "0.85cqw 0.7cqw", display: "grid", gap: "0.45cqw", alignContent: "start" }}>
              {PROCESS_PAYOFF.map((entry) => item(entry, entry))}
            </div>
          </div>
        </div>

      </div>
    </Slide>
  );
}

export function PayoffSlide({ deck }: { deck: Deck }) {
  return (
    <Slide dark page={7}>
      <Art art="keyhole" style={{ right: 0, top: "8%", width: "32%", height: "76%" }} />
      <div style={{ position: "absolute", top: "8.4cqw", left: "7.2cqw", width: "58%" }}>
        <Heading dark>{deck.payoff.heading}</Heading>
        <p style={{ margin: "1.2cqw 0 0", fontSize: "1.3cqw", lineHeight: 1.5, color: "rgba(255,255,255,0.92)" }}>{deck.payoff.intro}</p>
        <div style={{ marginTop: "1.6cqw", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.9cqw 1.4cqw" }}>
          {deck.payoff.items.map((entry, index) => (
            <div key={index} style={{ display: "flex", gap: "0.8cqw", alignItems: "flex-start", fontSize: "1.15cqw", lineHeight: 1.4 }}>
              <Bullet dark /><span>{entry}</span>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

export function KickoffSlide({ deck }: { deck: Deck }) {
  return (
    <Slide page={8}>
      <div style={{ position: "absolute", top: "8.4cqw", left: "7.2cqw", right: "7.2cqw" }}>
        <Heading>{deck.kickoff.heading}</Heading>
        <p style={{ margin: "1cqw 0 0", fontSize: "1.3cqw", lineHeight: 1.5, color: "#1F2A44" }}>{deck.kickoff.intro}</p>
        <div style={{ marginTop: "2cqw", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.9cqw" }}>
          {deck.kickoff.steps.slice(0, 5).map((step, index) => (
            <div key={index} style={{ borderRadius: "0.8cqw", background: index === 0 ? BLUE : "#EDF3FE", color: index === 0 ? "#FFFFFF" : INK, padding: "1.2cqw 1cqw", minHeight: "12cqw" }}>
              <span style={{ display: "grid", placeItems: "center", width: "2cqw", height: "2cqw", borderRadius: "999px", background: index === 0 ? "rgba(255,255,255,0.2)" : BLUE, color: "#FFFFFF", fontSize: "1cqw", fontWeight: 700 }}>{index + 1}</span>
              <strong style={{ display: "block", marginTop: "0.9cqw", fontSize: "1.05cqw", lineHeight: 1.3 }}>{step.title}</strong>
              <span style={{ display: "block", marginTop: "0.5cqw", fontSize: "0.9cqw", lineHeight: 1.45, color: index === 0 ? "rgba(255,255,255,0.9)" : "#5C6C8B" }}>{step.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

export function CtaSlide({ deck }: { deck: Deck }) {
  // No page prop: the closing slide runs without footer chrome.
  return (
    <Slide dark>
      <div style={{ position: "absolute", top: "12cqw", left: "7.2cqw", right: "7.2cqw", maxWidth: "68%" }}>
        <Heading dark>{deck.cta.heading}</Heading>
        <p style={{ margin: "1.2cqw 0 0", fontSize: "1.3cqw", lineHeight: 1.55, color: "rgba(255,255,255,0.92)" }}>{deck.cta.body}</p>
        <a
          href={deck.cta.primary_url}
          target="_blank"
          rel="noreferrer"
          style={{ display: "inline-block", marginTop: "1.8cqw", padding: "1cqw 2cqw", borderRadius: "999px", background: "#FFFFFF", color: BLUE, fontSize: "1.2cqw", fontWeight: 700, textDecoration: "none" }}
        >
          {deck.cta.primary_label}
        </a>
        <p style={{ margin: "1.4cqw 0 0", fontSize: "1.05cqw", color: "rgba(255,255,255,0.85)" }}>
          {deck.cta.primary_url}
          <br />
          {deck.cta.email}
        </p>
      </div>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${DEEP}00 0%, ${DEEP}00 100%)`, pointerEvents: "none" }} />
    </Slide>
  );
}

export const PROPOSAL_SLIDE_LABELS = [
  "Title",
  "Who We Are",
  "The Big Picture",
  "Rewind",
  "The Opportunities",
  "Our Process",
  "The Payoff",
  "Kickoff",
  "Call to action",
] as const;

export default function ProposalDeckView({ deck, brandName, createdAt, coverUrl, gap = "clamp(16px, 2vw, 28px)" }: ProposalDeckProps & { gap?: string }) {
  return (
    <div style={{ display: "grid", gap }}>
      <CoverSlide deck={deck} brandName={brandName} createdAt={createdAt} coverUrl={coverUrl} />
      <WhoWeAreSlide deck={deck} />
      <BigPictureSlide deck={deck} />
      <RewindSlide deck={deck} />
      <OpportunitiesSlide deck={deck} />
      <ProcessSlide deck={deck} />
      <PayoffSlide deck={deck} />
      <KickoffSlide deck={deck} />
      <CtaSlide deck={deck} />
    </div>
  );
}
