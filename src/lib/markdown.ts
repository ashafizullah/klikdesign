// A small Markdown subset for AI chat replies: paragraphs, headings, lists,
// quotes, code, rules, bold, italic and links. It builds a tree instead of
// HTML, so model output can never inject markup.

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong" | "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "p" | "quote"; lines: Inline[][] }
  | { t: "h"; level: number; c: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: Inline[][] }
  | { t: "code"; v: string }
  | { t: "hr" };

const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(?!\s)((?:[^*]|\*\*[^*]+\*\*)*?[^\s*])\*|(?<![\p{L}\p{N}])_(?!\s)([^_]*?[^\s_])_(?![\p{L}\p{N}])|\[([^\]]+)\]\(([^)\s]+)\)/u;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) break;
    if (m.index) out.push({ t: "text", v: rest.slice(0, m.index) });
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ t: "strong", c: parseInline(m[2] ?? m[3]) });
    else if (m[4] !== undefined || m[5] !== undefined) out.push({ t: "em", c: parseInline(m[4] ?? m[5]) });
    else out.push({ t: "link", href: m[7], c: parseInline(m[6]) });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push({ t: "text", v: rest });
  return out;
}

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // Code fence; an unclosed one (still streaming) runs to the end.
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      blocks.push({ t: "code", v: body.join("\n") });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      blocks.push({ t: "h", level: h[1].length, c: parseInline(h[2]) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    const li = LIST_ITEM.exec(line);
    if (li) {
      const ordered = !li[1];
      const items: Inline[][] = [];
      let text = li[3];
      for (i++; i < lines.length; i++) {
        const next = LIST_ITEM.exec(lines[i]);
        if (next && !next[1] === ordered) {
          items.push(parseInline(text));
          text = next[3];
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && !next) {
          text += ` ${lines[i].trim()}`; // wrapped continuation of the item
        } else break;
      }
      items.push(parseInline(text));
      blocks.push({ t: "list", ordered, start: ordered ? Number(li[2]) : 1, items });
      continue;
    }
    const quote = /^\s*>/.test(line);
    const para: Inline[][] = [];
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim() || /^\s*```/.test(l) || HEADING.test(l) || RULE.test(l) || LIST_ITEM.test(l) || /^\s*>/.test(l) !== quote) break;
      para.push(parseInline(quote ? l.replace(/^\s*>\s?/, "") : l));
    }
    blocks.push({ t: quote ? "quote" : "p", lines: para });
  }
  return blocks;
}
