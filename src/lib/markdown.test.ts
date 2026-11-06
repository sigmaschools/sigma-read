import assert from "node:assert/strict";
import { parseMarkdown, parseInline, markdownToPlainText } from "./markdown";

// Inline styles
assert.deepEqual(parseInline("Plain text"), [{ text: "Plain text" }]);
assert.deepEqual(parseInline("A **bold** and *italic* word"), [
  { text: "A " }, { text: "bold", bold: true }, { text: " and " }, { text: "italic", italic: true }, { text: " word" },
]);
assert.deepEqual(parseInline("__strong__ _soft_"), [{ text: "strong", bold: true }, { text: " " }, { text: "soft", italic: true }]);
assert.deepEqual(parseInline("***both***"), [{ text: "both", bold: true, italic: true }]);
assert.deepEqual(parseInline("**bold with *italic* inside**"), [
  { text: "bold with ", bold: true }, { text: "italic", bold: true, italic: true }, { text: " inside", bold: true },
]);
assert.deepEqual(parseInline("snake_case_name stays"), [{ text: "snake_case_name stays" }]);
assert.deepEqual(parseInline("5 * 3 * 2 = 30"), [{ text: "5 * 3 * 2 = 30" }]);
assert.deepEqual(parseInline("a lone ** stays"), [{ text: "a lone ** stays" }]);
assert.deepEqual(parseInline("\\*not italic\\*"), [{ text: "*not italic*" }]);
assert.deepEqual(parseInline("See [NASA](https://nasa.gov) now"), [{ text: "See NASA now" }]);
assert.deepEqual(parseInline("x ![pic](a.png) y"), [{ text: "x  y" }]);
assert.deepEqual(parseInline("use `code` here"), [{ text: "use " }, { text: "code", code: true }, { text: " here" }]);
// Raw HTML is never interpreted: it stays as literal text
assert.deepEqual(parseInline("<b>hi</b><script>x</script>"), [{ text: "<b>hi</b><script>x</script>" }]);

// The screenshot's case: a bold line used as a subheading
const solar = parseMarkdown("Intro paragraph.\n\n**A View from Space**\n\nFrom orbit, the panels shine.");
assert.deepEqual(solar, [
  { type: "paragraph", runs: [{ text: "Intro paragraph." }] },
  { type: "heading", level: 2, runs: [{ text: "A View from Space" }] },
  { type: "paragraph", runs: [{ text: "From orbit, the panels shine." }] },
]);
// Bold heading followed by text with only one newline
assert.deepEqual(parseMarkdown("**Why It Matters**\nPower for homes."), [
  { type: "heading", level: 2, runs: [{ text: "Why It Matters" }] },
  { type: "paragraph", runs: [{ text: "Power for homes." }] },
]);
// A bold sentence inside a paragraph is not a heading
assert.equal(parseMarkdown("Some text **bold** more.")[0].type, "paragraph");

// # headings: a leading H1 (the title again) is dropped; ## and ### kept
assert.deepEqual(parseMarkdown("# Title\n\n## Part one\n\nText.\n\n### Detail\nMore."), [
  { type: "heading", level: 2, runs: [{ text: "Part one" }] },
  { type: "paragraph", runs: [{ text: "Text." }] },
  { type: "heading", level: 3, runs: [{ text: "Detail" }] },
  { type: "paragraph", runs: [{ text: "More." }] },
]);
assert.deepEqual(parseMarkdown("## *Styled* heading ##"), [
  { type: "heading", level: 2, runs: [{ text: "Styled", italic: true }, { text: " heading" }] },
]);

// Lists
assert.deepEqual(parseMarkdown("Facts:\n- one\n- **two**\n  continued\n\n1. first\n2. second"), [
  { type: "paragraph", runs: [{ text: "Facts:" }] },
  { type: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two", bold: true }, { text: " continued" }]] },
  { type: "list", ordered: true, items: [[{ text: "first" }], [{ text: "second" }]] },
]);
// A line starting with an italic word is not a bullet
assert.equal(parseMarkdown("*Wow.* That is big.")[0].type, "paragraph");

// Quotes and rules
assert.deepEqual(parseMarkdown("> A quote\n> more\n\n---\n\nEnd."), [
  { type: "quote", runs: [{ text: "A quote\nmore" }] },
  { type: "rule" },
  { type: "paragraph", runs: [{ text: "End." }] },
]);

// Old plain articles render as before: paragraphs split on blank lines
assert.deepEqual(parseMarkdown("One.\r\n\r\nTwo.\n\n\n\nThree."), [
  { type: "paragraph", runs: [{ text: "One." }] },
  { type: "paragraph", runs: [{ text: "Two." }] },
  { type: "paragraph", runs: [{ text: "Three." }] },
]);

// Plain text for summaries: no marks, no headings
assert.equal(markdownToPlainText("# T\n\nA **big** day.\n\n**Sub**\n\n- x\n- y"), "A big day.\n\nx\ny");
assert.equal(markdownToPlainText("**Sub**\n\nText.", { headings: true }), "Sub\n\nText.");

console.log("✅ markdown parses article text");
