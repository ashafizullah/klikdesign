import { expect, test } from "bun:test";
import { parseInline, parseMarkdown } from "./markdown";

test("inline bold, italic, code and links", () => {
  expect(parseInline('**Subjudul:** kata "otomatis." dan `code`')).toEqual([
    { t: "strong", c: [{ t: "text", v: "Subjudul:" }] },
    { t: "text", v: ' kata "otomatis." dan ' },
    { t: "code", v: "code" },
  ]);
  expect(parseInline("*miring* [situs](https://x.id)")).toEqual([
    { t: "em", c: [{ t: "text", v: "miring" }] },
    { t: "text", v: " " },
    { t: "link", href: "https://x.id", c: [{ t: "text", v: "situs" }] },
  ]);
  // Lone markers and snake_case stay plain text.
  expect(parseInline("2 * 3 = 6, file_name_here")).toEqual([{ t: "text", v: "2 * 3 = 6, file_name_here" }]);
});

test("lists, paragraphs, headings and fences", () => {
  const blocks = parseMarkdown("Selesai.\n\n- **A:** satu\n- **B:** dua\n  lanjutan\n\n## Catatan\n1. x\n2. y\n```\nraw *text*");
  expect(blocks.map((b) => b.t)).toEqual(["p", "list", "h", "list", "code"]);
  const list = blocks[1] as Extract<(typeof blocks)[number], { t: "list" }>;
  expect(list.ordered).toBe(false);
  expect(list.items).toHaveLength(2);
  expect(list.items[1].at(-1)).toEqual({ t: "text", v: " dua lanjutan" });
  expect(blocks[3]).toMatchObject({ ordered: true, start: 1 });
  expect(blocks[4]).toEqual({ t: "code", v: "raw *text*" });
});
