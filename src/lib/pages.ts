// Multi-page designs (carousels). The open page lives in `background` and
// `elements`; these pure helpers convert between that and the full page list.
import type { Design, Page } from "../types/design";
import { newId } from "./ids";

export const pageCount = (d: Design) => (d.pages?.length ?? 0) + 1;

/** Every page in order, the open one included. */
export function allPages(d: Design): Page[] {
  const others = d.pages ?? [];
  const open: Page = { id: d.pageId ?? "page", background: d.background, elements: d.elements };
  const at = Math.min(d.page ?? 0, others.length);
  return [...others.slice(0, at), open, ...others.slice(at)];
}

/** The design with `pages` as its page list and page `open` (clamped) open. */
export function withPages(d: Design, pages: Page[], open: number): Design {
  const at = Math.min(Math.max(0, open), pages.length - 1);
  const p = pages[at];
  const others = pages.filter((_, i) => i !== at);
  const next: Design = { ...d, background: p.background, elements: p.elements, pageId: p.id, page: at, pages: others };
  if (!others.length) {
    delete next.pages;
    next.page = 0;
  }
  return next;
}

export const goToPage = (d: Design, i: number) => withPages(d, allPages(d), i);

/** Adds a page after the open one (blank with the same background, or a copy) and opens it. */
export function addPage(d: Design, copy = false): Design {
  const pages = allPages(d);
  const at = (d.page ?? 0) + 1;
  const page: Page = copy
    ? { id: newId("pg"), background: structuredClone(d.background), elements: structuredClone(d.elements).map((e) => ({ ...e, id: newId("el") })) }
    : { id: newId("pg"), background: structuredClone(d.background), elements: [] };
  pages.splice(at, 0, page);
  return withPages(d, pages, at);
}

/** Removes page `i`; the last page cannot be removed. */
export function removePage(d: Design, i: number): Design {
  const pages = allPages(d);
  if (pages.length < 2 || i < 0 || i >= pages.length) return d;
  const open = d.page ?? 0;
  pages.splice(i, 1);
  return withPages(d, pages, i < open ? open - 1 : Math.min(open, pages.length - 1));
}

/** Moves page `from` to index `to`; the open page stays open. */
export function movePage(d: Design, from: number, to: number): Design {
  const pages = allPages(d);
  if (from === to || from < 0 || from >= pages.length) return d;
  const openId = pages[d.page ?? 0].id;
  const [p] = pages.splice(from, 1);
  pages.splice(Math.min(Math.max(0, to), pages.length), 0, p);
  return withPages(d, pages, pages.findIndex((x) => x.id === openId));
}

/** A single-page design of page `i`, for previews and per-page work. */
export function pageAsDesign(d: Design, i: number): Design {
  const p = allPages(d)[i];
  const { pages: _p, page: _i, ...rest } = d;
  return { ...rest, background: p.background, elements: p.elements, pageId: p.id };
}
