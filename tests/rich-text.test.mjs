import { strict as assert } from "node:assert";
import test from "node:test";
import { htmlToReadableText, parseRichText, looksLikeHtml, richTextToSingleLine } from "../src/lib/rich-text.ts";

/** The brief from the order on screen, exactly as the editor stores it. */
const BRIEF = [
  "<p>Objective: Create a visually engaging carousel for promoting the cMeet watch party.</p>",
  "<p>Key Elements:</p>",
  "<ul><li>Brand Name: cMeet</li><li>Event Type: Watch Party</li><li>Target Audience: Individuals interested in group viewing experiences</li></ul>",
  "<p>Design Requirements:</p>",
  "<ul><li>Incorporate cMeet branding elements (logo, color scheme)</li><li>Highlight the social aspect of the watch party</li></ul>",
  "<p>Format: Carousel should be optimized for social media platforms.</p>",
].join("");

test("the tags never reach the reader", () => {
  const text = htmlToReadableText(BRIEF);
  assert.equal(/<\/?[a-z]/i.test(text), false, "no markup may survive");
  assert.equal(text.includes("<li>"), false);
  assert.equal(text.includes("<p>"), false);
});

test("bullets stay bullets instead of running together", () => {
  const text = htmlToReadableText(BRIEF);
  assert.match(text, /- Brand Name: cMeet/);
  assert.match(text, /- Event Type: Watch Party/);
  // The old behaviour collapsed every list onto one line.
  assert.ok(text.split("\n").length > 8, "the brief must keep its lines");
});

test("paragraphs are separated so the brief is scannable", () => {
  const text = htmlToReadableText(BRIEF);
  assert.match(text, /Key Elements:\n- Brand Name/);
  assert.match(text, /\n\nDesign Requirements:/);
});

test("a numbered list is numbered", () => {
  const text = htmlToReadableText("<ol><li>First</li><li>Second</li></ol>");
  assert.equal(text, "1. First\n2. Second");
});

test("structure is available for rendering, not just for text", () => {
  const nodes = parseRichText(BRIEF);
  const lists = nodes.filter((node) => node.kind === "list");
  assert.equal(lists.length, 2);
  assert.equal(lists[0].ordered, false);
  assert.deepEqual(lists[0].items.slice(0, 2), ["Brand Name: cMeet", "Event Type: Watch Party"]);
  assert.equal(nodes[0].kind, "paragraph");
  assert.match(nodes[0].text, /^Objective:/);
});

test("plain typed text is left alone, not mangled into markup", () => {
  const typed = "First thought.\n\nSecond thought.";
  assert.equal(looksLikeHtml(typed), false);
  assert.equal(htmlToReadableText(typed), typed);
});

test("entities are decoded rather than shown raw", () => {
  assert.equal(htmlToReadableText("<p>Tom &amp; Jerry&#x27;s &quot;show&quot;</p>"), `Tom & Jerry's "show"`);
  assert.equal(htmlToReadableText("<p>a&nbsp;b</p>"), "a b");
});

test("an entity cannot smuggle a tag back in", () => {
  // Decoding happens after tags are stripped, so this stays inert text.
  const text = htmlToReadableText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  assert.equal(text, "<script>alert(1)</script>");
  assert.equal(parseRichText("<p>&lt;b&gt;x&lt;/b&gt;</p>")[0].text, "<b>x</b>");
});

test("empty and missing briefs do not crash", () => {
  assert.equal(htmlToReadableText(""), "");
  assert.equal(htmlToReadableText(null), "");
  assert.equal(htmlToReadableText(undefined), "");
  assert.deepEqual(parseRichText("<p></p><ul></ul>"), []);
});

test("a single line version is still available where one is needed", () => {
  const line = richTextToSingleLine(BRIEF);
  assert.equal(line.includes("\n"), false);
  assert.match(line, /^Objective: Create a visually engaging carousel/);
});

test("line breaks inside a paragraph become their own lines", () => {
  assert.equal(htmlToReadableText("<p>One<br>Two</p>"), "One\nTwo");
});
