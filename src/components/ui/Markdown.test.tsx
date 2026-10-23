import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";

test("renders a chat reply's Markdown as elements, escaping any HTML", () => {
  const html = renderToStaticMarkup(<Markdown text={'Selesai.\n\n- **Subjudul:** kata *terakhir* <script>x</script>\n- [Docs](https://x.id)'} />);
  expect(html).toContain("<p>Selesai.</p>");
  expect(html).toContain('<li><strong class="font-semibold text-text">Subjudul:</strong> kata <em>terakhir</em> &lt;script&gt;x&lt;/script&gt;</li>');
  expect(html).toContain('href="https://x.id"');
  expect(html).not.toContain("<script>");
});
