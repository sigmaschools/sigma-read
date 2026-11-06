import type { ReactNode } from "react";
import { parseMarkdown, type Run } from "@/lib/markdown";

/** Words as tappable spans (data-word), for the reader's tap-to-define */
function words(text: string, key: string): ReactNode[] {
  return text.split(/(\s+)/).map((w, j) =>
    !w ? null : /^\s+$/.test(w) ? (
      <span key={`${key}-${j}`}>{w}</span>
    ) : (
      <span
        key={`${key}-${j}`}
        data-word={w.replace(/[^a-zA-Z'-]/g, "")}
        className="cursor-pointer hover:bg-blue-50 hover:text-[var(--accent)] rounded transition-colors"
      >
        {w}
      </span>
    ),
  );
}

function runs(list: Run[], tappable: boolean): ReactNode[] {
  return list.map((r, i) => {
    let node: ReactNode = tappable && !r.code ? words(r.text, String(i)) : r.text;
    if (r.code) node = <code className="font-mono text-[0.9em] bg-[var(--surface)] px-1 rounded">{node}</code>;
    if (r.italic) node = <em>{node}</em>;
    if (r.bold) node = <strong className="font-semibold">{node}</strong>;
    return <span key={i}>{node}</span>;
  });
}

/**
 * An article body written in Markdown, rendered as React elements (never raw HTML).
 * `tappable` wraps each word in a data-word span for tap-to-define.
 */
export function ArticleBody({ text, tappable = false, paragraphClassName = "mb-5" }: { text: string; tappable?: boolean; paragraphClassName?: string }) {
  return (
    <>
      {parseMarkdown(text).map((block, i) => {
        switch (block.type) {
          case "heading": {
            const Tag = (`h${block.level}`) as "h2" | "h3" | "h4";
            const size = block.level === 2 ? "text-lg" : "text-base";
            return <Tag key={i} className={`font-semibold ${size} mt-6 mb-2`}>{runs(block.runs, false)}</Tag>;
          }
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={i} className={`${block.ordered ? "list-decimal" : "list-disc"} pl-6 mb-5 space-y-1`}>
                {block.items.map((item, j) => <li key={j}>{runs(item, tappable)}</li>)}
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-[var(--border)] pl-4 italic text-[var(--muted)] mb-5">
                {runs(block.runs, tappable)}
              </blockquote>
            );
          case "rule":
            return <hr key={i} className="my-6 border-[var(--border)]" />;
          default:
            return <p key={i} className={paragraphClassName}>{runs(block.runs, tappable)}</p>;
        }
      })}
    </>
  );
}
