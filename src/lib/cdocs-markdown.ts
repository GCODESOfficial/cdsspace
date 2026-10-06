 
// Tiny markdown-lite parser used by both the public cDoc share page and
// the PDF exporter. Intentionally narrow - we only support what the
// editor's formatting buttons produce:
//
//   # Heading 1
//   ## Heading 2
//   • bullet                ← existing Bullets toggle output
//   **bold**                ← Bold button wraps selection in `**`
//   __underline__           ← Underline button wraps selection in `__`
//
// Returns a structured representation so the HTML view and PDF renderer
// can each style blocks consistently.

export type CDocBlock =
  | { kind: "h1"; spans: CDocSpan[] }
  | { kind: "h2"; spans: CDocSpan[] }
  | { kind: "bullet"; spans: CDocSpan[] }
  | { kind: "paragraph"; spans: CDocSpan[] }
  | { kind: "blank" };

export type CDocSpan =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "underline"; text: string };

// Parse a single line of inline markers (**bold**, __underline__). Unmatched
// markers are left as literal characters so the user sees exactly what they
// typed rather than having chunks disappear.
export function parseInlineSpans(line: string): CDocSpan[] {
  if (!line) return [];
  const out: CDocSpan[] = [];
  let i = 0;
  const push = (span: CDocSpan) => {
    // Merge adjacent text runs so the renderer can collapse them cleanly.
    const last = out[out.length - 1];
    if (span.type === "text" && last && last.type === "text") {
      last.text += span.text;
    } else if (span.text.length > 0) {
      out.push(span);
    }
  };

  while (i < line.length) {
    // Try bold: **...**
    if (line[i] === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end !== -1) {
        push({ type: "bold", text: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // Try underline: __...__
    if (line[i] === "_" && line[i + 1] === "_") {
      const end = line.indexOf("__", i + 2);
      if (end !== -1) {
        push({ type: "underline", text: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // Literal char
    push({ type: "text", text: line[i] });
    i++;
  }
  return out;
}

// Split the doc body into block-level elements.
export function parseCDocBody(body: string): CDocBlock[] {
  const lines = (body || "").split("\n");
  return lines.map((raw): CDocBlock => {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) return { kind: "blank" };

    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) return { kind: "h1", spans: parseInlineSpans(h1[1]) };

    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) return { kind: "h2", spans: parseInlineSpans(h2[1]) };

    const bullet = line.match(/^\s*[•\-*]\s+(.*)$/);
    if (bullet) return { kind: "bullet", spans: parseInlineSpans(bullet[1]) };

    return { kind: "paragraph", spans: parseInlineSpans(line) };
  });
}

/** Collapse blank lines between paragraphs/bullets into paragraph breaks. */
export function groupBlocks(blocks: CDocBlock[]): CDocBlock[][] {
  const groups: CDocBlock[][] = [];
  let current: CDocBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "blank") {
      if (current.length > 0) { groups.push(current); current = []; }
    } else {
      current.push(b);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// ---------------------------------------------------------------------------
// Round-trip helpers for the rich editor. The editor renders HTML; we
// persist markdown-lite so the PDF + public share page render identically.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function spansToHtml(spans: CDocSpan[]): string {
  return spans.map(s => {
    const text = escapeHtml(s.text);
    if (s.type === "bold") return `<strong>${text}</strong>`;
    if (s.type === "underline") return `<u>${text}</u>`;
    return text;
  }).join("");
}

/** markdown-lite → HTML suitable for a contentEditable div. */
export function cdocMarkdownToHtml(body: string): string {
  const blocks = parseCDocBody(body);
  const out: string[] = [];
  let listOpen = false;
  const closeList = () => { if (listOpen) { out.push("</ul>"); listOpen = false; } };

  for (const b of blocks) {
    if (b.kind === "bullet") {
      if (!listOpen) { out.push("<ul>"); listOpen = true; }
      out.push(`<li>${spansToHtml(b.spans) || "<br>"}</li>`);
      continue;
    }
    closeList();
    if (b.kind === "blank") {
      out.push("<p><br></p>");
      continue;
    }
    if (b.kind === "h1") {
      out.push(`<h1>${spansToHtml(b.spans)}</h1>`);
      continue;
    }
    if (b.kind === "h2") {
      out.push(`<h2>${spansToHtml(b.spans)}</h2>`);
      continue;
    }
    // paragraph
    out.push(`<p>${spansToHtml(b.spans) || "<br>"}</p>`);
  }
  closeList();
  return out.join("") || "<p><br></p>";
}

/**
 * HTML → markdown-lite. Walks the DOM of a contentEditable surface and
 * emits the same syntax the parser consumes. Tolerant of the messy HTML
 * browsers produce (mixed `<div>`, `<br>`, trailing whitespace, etc.).
 */
export function cdocHtmlToMarkdown(html: string): string {
  if (typeof document === "undefined") return "";
  const container = document.createElement("div");
  container.innerHTML = html;

  const lines: string[] = [];

  // Walk top-level children. Browsers emit mixed block sets - h1/h2/p/div/ul/li -
  // so we handle them explicitly and fall back to inlining stray text.
  const emitInline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    // Inline-level style carriers.
    if (tag === "br") return "\n";
    const inner = Array.from(el.childNodes).map(emitInline).join("");
    if (tag === "strong" || tag === "b") return `**${inner}**`;
    if (tag === "u") return `__${inner}__`;
    if (tag === "em" || tag === "i") return `**${inner}**`; // treat italics as bold
    // Any other inline wrapper (span, font, etc.) - return contents.
    return inner;
  };

  const pushLine = (raw: string) => {
    // Browsers sometimes append a trailing \u00A0 or stray <br> - normalize.
    const s = raw.replace(/\u00A0/g, " ").replace(/\s+$/g, "");
    lines.push(s);
  };

  const walkBlock = (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "h1") {
      pushLine(`# ${emitInline(el).trim()}`);
      return;
    }
    if (tag === "h2") {
      pushLine(`## ${emitInline(el).trim()}`);
      return;
    }
    if (tag === "ul" || tag === "ol") {
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== "li") continue;
        pushLine(`• ${emitInline(li as HTMLElement).trim()}`);
      }
      return;
    }
    if (tag === "li") {
      pushLine(`• ${emitInline(el).trim()}`);
      return;
    }
    if (tag === "p" || tag === "div") {
      // A <p> with just <br> is a blank line. Otherwise emit the inline
      // rendering, respecting any <br>s inside by splitting on \n.
      const inner = emitInline(el);
      const trimmed = inner.replace(/\n+$/g, "");
      if (!trimmed.replace(/\s+/g, "")) {
        pushLine("");
        return;
      }
      for (const ln of trimmed.split("\n")) pushLine(ln);
      return;
    }
    // Unknown block - inline it.
    const inner = emitInline(el);
    for (const ln of inner.split("\n")) pushLine(ln);
  };

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || "").trim();
      if (t) pushLine(t);
      continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      walkBlock(node as HTMLElement);
    }
  }

  // Collapse trailing blank lines.
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join("\n");
}
