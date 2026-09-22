/**
 * Briefs are written in the client's rich text editor and stored as HTML with a
 * deliberately tiny tag set (p, br, ul, ol, li, strong, b, em, i, u - see
 * cleanBrief in /api/requests). Everything downstream then has to show that
 * brief somewhere, and the two places it lands need opposite things:
 *
 *   - A plain text field, such as a taskboard note, needs the structure flattened
 *     into readable lines. Stripping the tags and collapsing whitespace, which is
 *     what happened before, turned a brief with headings and four bullet lists
 *     into a single unbroken paragraph.
 *   - A rendered panel needs the structure kept, so bullets look like bullets
 *     rather than "<li>" appearing on screen.
 *
 * Both are built from the same tiny parser here so they cannot disagree about
 * what the brief says.
 */

export type RichTextNode =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

// Non-capturing: a capturing group would make String.split return the tag name
// as a fragment of its own, so "<p>One<br>Two</p>" gained a stray "p".
const BLOCK_END = /<\/(?:p|div|h[1-6]|li|ul|ol|tr)\s*>/gi;
const LINE_BREAK = /<br\s*\/?>/gi;
const LIST_ITEM_START = /<li[^>]*>/gi;

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, ""))
    // Collapse runs of spaces and tabs but never newlines: the newlines are the
    // structure this whole module exists to preserve.
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/** True when the value carries markup rather than being plain typed text. */
export function looksLikeHtml(value: string | null | undefined) {
  return typeof value === "string" && /<\/?(p|br|ul|ol|li|strong|b|em|i|u|div|h[1-6])\b[^>]*>/i.test(value);
}

/**
 * The brief as structured blocks, for rendering. Only paragraphs and lists,
 * because that is all the editor can produce.
 */
export function parseRichText(value: string | null | undefined): RichTextNode[] {
  const source = String(value || "");
  if (!source.trim()) return [];
  if (!looksLikeHtml(source)) {
    return source
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((text) => ({ kind: "paragraph" as const, text }));
  }

  const nodes: RichTextNode[] = [];
  // Split on list containers so their items can be gathered together, and
  // whatever sits between them stays as ordinary paragraphs.
  const parts = source.split(/(<ul[^>]*>[\s\S]*?<\/ul>|<ol[^>]*>[\s\S]*?<\/ol>)/gi);

  for (const part of parts) {
    if (!part || !part.trim()) continue;
    const listMatch = /^<(ul|ol)[^>]*>([\s\S]*)<\/(?:ul|ol)>$/i.exec(part.trim());
    if (listMatch) {
      const items = listMatch[2]
        .split(/<li[^>]*>/i)
        .map((item) => stripTags(item))
        .filter(Boolean);
      if (items.length) nodes.push({ kind: "list", ordered: listMatch[1].toLowerCase() === "ol", items });
      continue;
    }
    for (const block of part.replace(LINE_BREAK, "\n").split(BLOCK_END)) {
      const text = stripTags(block);
      if (text) nodes.push({ kind: "paragraph", text });
    }
  }
  return nodes;
}

/**
 * The brief as readable plain text, for fields that can only hold text.
 * Paragraphs are separated by a blank line and list items become bullets, so a
 * long brief stays scannable instead of arriving as one run-on sentence.
 */
export function htmlToReadableText(value: string | null | undefined) {
  const nodes = parseRichText(value);
  let out = "";
  nodes.forEach((node, index) => {
    const block = node.kind === "paragraph"
      ? node.text
      : node.items.map((item, position) => (node.ordered ? `${position + 1}. ${item}` : `- ${item}`)).join("\n");
    if (index > 0) {
      // A label and the list it introduces belong together. "Key Elements:"
      // followed by a blank line and then its own bullets reads as two
      // unrelated things.
      const previous = nodes[index - 1];
      const introducesThisList = node.kind === "list"
        && previous.kind === "paragraph"
        && previous.text.trimEnd().endsWith(":");
      out += introducesThisList ? "\n" : "\n\n";
    }
    out += block;
  });
  return out.trim();
}

/** Everything above, minus the structure: for a one-line preview or a search index. */
export function richTextToSingleLine(value: string | null | undefined) {
  return htmlToReadableText(value).replace(/\s+/g, " ").trim();
}
