import { Fragment, useMemo, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { parseMarkdown, type Block, type Inline } from "../../lib/markdown";
import { notifyError } from "../../store/ui";

/** Renders an AI reply's Markdown as React elements (never as raw HTML). */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className={`space-y-2 ${className}`}>{blocks.map(block)}</div>;
}

function block(b: Block, i: number): ReactNode {
  switch (b.t) {
    case "p":
      return <p key={i}>{lines(b.lines)}</p>;
    case "quote":
      return <blockquote key={i} className="border-l-2 border-line pl-2 text-muted">{lines(b.lines)}</blockquote>;
    case "h":
      return <p key={i} className={`font-semibold ${b.level <= 2 ? "text-[13px]" : ""}`}>{inline(b.c)}</p>;
    case "list": {
      const List = b.ordered ? "ol" : "ul";
      return (
        <List key={i} start={b.ordered ? b.start : undefined} className={`space-y-1 pl-4 ${b.ordered ? "list-decimal" : "list-disc"} marker:text-muted`}>
          {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </List>
      );
    }
    case "code":
      return <pre key={i} className="overflow-x-auto rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[11px]">{b.v}</pre>;
    case "hr":
      return <hr key={i} className="border-line" />;
  }
}

const lines = (ls: Inline[][]) => ls.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>);

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <Fragment key={i}>{n.v}</Fragment>;
      case "strong":
        return <strong key={i} className="font-semibold text-text">{inline(n.c)}</strong>;
      case "em":
        return <em key={i}>{inline(n.c)}</em>;
      case "code":
        return <code key={i} className="rounded bg-panel-2 px-1 py-px font-mono text-[11px]">{n.v}</code>;
      case "link":
        if (!/^https?:\/\//i.test(n.href)) return <Fragment key={i}>{inline(n.c)}</Fragment>;
        return (
          <a
            key={i}
            href={n.href}
            title={n.href}
            className="text-accent underline underline-offset-2"
            onClick={(e) => {
              e.preventDefault();
              openUrl(n.href).catch(notifyError);
            }}
          >
            {inline(n.c)}
          </a>
        );
    }
  });
}
