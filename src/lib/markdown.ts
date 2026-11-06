/**
 * A small Markdown parser for article text. It returns plain data (blocks of
 * styled text runs), never HTML, so the reader can render it with React and
 * keep its tap-a-word-to-define spans. Raw HTML in the source stays literal text.
 *
 * Handles: # headings, a paragraph that is only **bold** (models use it as a
 * subheading), paragraphs, - / * / 1. lists, > quotes, --- rules,
 * **bold**, __bold__, *italic*, _italic_, `code`, [links](url) (text only),
 * images (dropped) and backslash escapes. Anything unmatched stays literal.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type Block =
  | { type: "heading"; level: 2 | 3 | 4; runs: Run[] }
  | { type: "paragraph"; runs: Run[] }
  | { type: "list"; ordered: boolean; items: Run[][] }
  | { type: "quote"; runs: Run[] }
  | { type: "rule" };

type Style = Omit<Run, "text">;

const INLINE = new RegExp(
  [
    /\\([\\`*_[\]()#+\-.!>~])/.source, // 1 escape
    /`([^`\n]+)`/.source, // 2 code
    /!\[([^\]]*)\]\([^)\s]*\)/.source, // 3 image (dropped)
    /\[([^\]]+)\]\([^)\s]*\)/.source, // 4 link text
    /\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/.source, // 5 bold italic
    /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/.source, // 6 bold
    /(?<![\w])__(?=\S)([\s\S]+?)(?<=\S)__(?![\w])/.source, // 7 bold
    /\*(?=[^\s*])([\s\S]+?)(?<=[^\s*])\*/.source, // 8 italic
    /(?<![\w])_(?=[^\s_])([\s\S]+?)(?<=[^\s_])_(?![\w])/.source, // 9 italic
  ].join("|"),
  "g",
);

function push(runs: Run[], text: string, style: Style) {
  if (!text) return;
  const last = runs[runs.length - 1];
  if (last && !!last.bold === !!style.bold && !!last.italic === !!style.italic && !!last.code === !!style.code) {
    last.text += text;
    return;
  }
  runs.push({ text, ...(style.bold && { bold: true }), ...(style.italic && { italic: true }), ...(style.code && { code: true }) });
}

function inline(text: string, style: Style, runs: Run[]) {
  const re = new RegExp(INLINE.source, "g");
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    push(runs, text.slice(at, m.index), style);
    at = m.index + m[0].length;
    if (m[1] !== undefined) push(runs, m[1], style);
    else if (m[2] !== undefined) push(runs, m[2], { ...style, code: true });
    else if (m[3] !== undefined) continue;
    else if (m[4] !== undefined) inline(m[4], style, runs);
    else if (m[5] !== undefined) inline(m[5], { ...style, bold: true, italic: true }, runs);
    else if (m[6] !== undefined || m[7] !== undefined) inline((m[6] ?? m[7])!, { ...style, bold: true }, runs);
    else inline((m[8] ?? m[9])!, { ...style, italic: true }, runs);
  }
  push(runs, text.slice(at), style);
}

/** Styled runs for one line or paragraph of Markdown */
export function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  inline(text, {}, runs);
  return runs;
}

const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const BULLET = /^[ \t]*[-*+][ \t]+(.*)$/;
const NUMBERED = /^[ \t]*\d+[.)][ \t]+(.*)$/;
const QUOTE = /^[ \t]*>[ \t]?(.*)$/;
const RULE = /^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/;
/** A whole line in bold (or bold italic), as models write subheadings */
const BOLD_LINE = /^(\*\*\*?|__)(?=\S)([^*_\n]+?)(?<=\S)\1:?$/;

/** Blocks for an article body. A leading # heading (the title again) is dropped. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  function flush() {
    if (para.length) {
      blocks.push({ type: "paragraph", runs: parseInline(para.join("\n").trim()) });
      para = [];
    }
    if (list) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items.map((t) => parseInline(t.trim())) });
      list = null;
    }
    if (quote.length) {
      blocks.push({ type: "quote", runs: parseInline(quote.join("\n").trim()) });
      quote = [];
    }
  }

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      const depth = heading[1].length;
      if (depth === 1 && blocks.length === 0) continue;
      const level = (Math.min(Math.max(depth, 2), 4)) as 2 | 3 | 4;
      if (heading[2]) blocks.push({ type: "heading", level, runs: parseInline(heading[2]) });
      continue;
    }
    const bold = para.length ? null : line.trim().match(BOLD_LINE);
    if (bold && line.trim().length <= 100) {
      flush();
      blocks.push({ type: "heading", level: 2, runs: parseInline(bold[2].trim()) });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }
    const bullet = line.match(BULLET);
    const numbered = bullet ? null : line.match(NUMBERED);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (para.length || quote.length || (list && list.ordered !== ordered)) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    const q = line.match(QUOTE);
    if (q) {
      if (para.length || list) flush();
      quote.push(q[1]);
      continue;
    }
    if (list) {
      // An indented or lazy continuation line belongs to the last item
      list.items[list.items.length - 1] += " " + line.trim();
      continue;
    }
    if (quote.length) flush();
    para.push(line);
  }
  flush();
  return blocks;
}

function runsText(runs: Run[]): string {
  return runs.map((r) => r.text).join("");
}

/** The article's text without Markdown marks or headings, for summaries and previews */
export function markdownToPlainText(source: string, { headings = false } = {}): string {
  return parseMarkdown(source)
    .flatMap((b) => {
      if (b.type === "heading") return headings ? [runsText(b.runs)] : [];
      if (b.type === "rule") return [];
      if (b.type === "list") return [b.items.map(runsText).join("\n")];
      return [runsText(b.runs)];
    })
    .join("\n\n");
}
