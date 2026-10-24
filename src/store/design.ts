import { create } from "zustand";
import { temporal } from "zundo";
import type { Design, El, NewEl, Page } from "../types/design";
import { normalizeElement, normalizeFill } from "../types/design";
import { newId } from "../lib/ids";
import * as pages from "../lib/pages";
import * as groups from "../lib/groups";

export function emptyDesign(over: Partial<Design> = {}): Design {
  return { version: 1, id: newId("dsn"), name: "Untitled design", width: 1080, height: 1350, background: "#ffffff", elements: [], ...over };
}

/** Fills fields added after a design file was written and drops broken elements. */
export function normalizeDesign(raw: Partial<Design>): Design {
  const base = emptyDesign();
  const normEls = (list: unknown) =>
    (Array.isArray(list) ? (list as El[]) : [])
      .map((e) => normalizeElement(e as unknown as Record<string, unknown>, typeof e?.id === "string" ? e.id : newId("el")))
      .filter((e): e is El => !!e);
  const pages: Page[] = (Array.isArray(raw.pages) ? raw.pages : []).map((p) => ({
    id: typeof p?.id === "string" ? p.id : newId("pg"),
    background: normalizeFill(p?.background, "#ffffff"),
    elements: normEls(p?.elements),
  }));
  const d: Design = {
    ...base,
    ...raw,
    version: 1,
    width: Math.max(16, Math.round(raw.width ?? base.width)),
    height: Math.max(16, Math.round(raw.height ?? base.height)),
    background: normalizeFill(raw.background, "#ffffff"),
    elements: normEls(raw.elements),
    pageId: typeof raw.pageId === "string" ? raw.pageId : newId("pg"),
    page: Math.min(Math.max(0, Math.round(Number(raw.page) || 0)), pages.length),
  };
  if (pages.length) d.pages = pages;
  else delete d.pages;
  return d;
}

export type Reorder = "front" | "back" | "forward" | "backward";

/** Moves `ids` within `list` (bottom → top order), keeping their relative order. */
export function reorder(list: El[], ids: string[], to: Reorder): El[] {
  const set = new Set(ids);
  const picked = list.filter((e) => set.has(e.id));
  const rest = list.filter((e) => !set.has(e.id));
  if (to === "front") return [...rest, ...picked];
  if (to === "back") return [...picked, ...rest];
  const out = [...list];
  const step = to === "forward" ? 1 : -1;
  const order = to === "forward" ? [...out.keys()].reverse() : [...out.keys()];
  for (const i of order) {
    const j = i + step;
    if (!set.has(out[i].id) || j < 0 || j >= out.length || set.has(out[j].id)) continue;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface DesignState {
  design: Design;
  dirty: boolean;
  selected: string[];

  load(design: Design): void;
  markSaved(): void;
  update(fn: (d: Design) => void): void;
  select(ids: string[]): void;

  /** Adds elements (top of the stack) and selects them; returns their ids. */
  add(els: NewEl[]): string[];
  patch(id: string, patch: Partial<El>): void;
  patchMany(patches: { id: string; patch: Partial<El> }[]): void;
  remove(ids: string[]): void;
  duplicate(ids: string[]): string[];
  reorder(ids: string[], to: Reorder): void;
  /** Groups the elements (and the groups they touch); ungroup dissolves their groups. */
  group(ids: string[]): void;
  ungroup(ids: string[]): void;
  renameGroup(groupId: string, name: string): void;

  /** Page actions (carousel); each clears the selection. */
  openPage(i: number): void;
  addPage(copy?: boolean): void;
  removePage(i: number): void;
  movePage(from: number, to: number): void;
}

/** Mutating helper: zustand state stays immutable via structuredClone. */
function produce(d: Design, fn: (draft: Design) => void): Design {
  const draft = structuredClone(d);
  fn(draft);
  return draft;
}

export const useDesign = create<DesignState>()(
  temporal(
    (set, get) => ({
      design: emptyDesign(),
      dirty: false,
      selected: [],

      load: (design) => set({ design, dirty: false, selected: [] }),
      markSaved: () => set({ dirty: false }),
      update: (fn) => set((s) => ({ design: produce(s.design, fn), dirty: true })),
      select: (selected) => set({ selected }),

      add: (els) => {
        const added = els.map((e) => ({ ...e, id: newId("el") }) as El);
        get().update((d) => void d.elements.push(...added));
        set({ selected: added.map((e) => e.id) });
        return added.map((e) => e.id);
      },

      patch: (id, patch) => get().patchMany([{ id, patch }]),

      patchMany: (patches) =>
        get().update((d) => {
          for (const { id, patch } of patches) {
            const el = d.elements.find((e) => e.id === id);
            if (el) Object.assign(el, patch);
          }
        }),

      remove: (ids) => {
        const set_ = new Set(ids);
        get().update((d) => void (d.elements = groups.pruneGroups(d.elements.filter((e) => !set_.has(e.id)))));
        set((s) => ({ selected: s.selected.filter((id) => !set_.has(id)) }));
      },

      duplicate: (ids) => {
        const { elements } = get().design;
        const src = groups.regroup(structuredClone(elements.filter((e) => ids.includes(e.id))), elements);
        return get().add(src.map(({ id: _id, ...e }) => ({ ...e, x: e.x + 24, y: e.y + 24 })));
      },

      reorder: (ids, to) => get().update((d) => void (d.elements = reorder(d.elements, ids, to))),
      group: (ids) => {
        get().update((d) => void (d.elements = groups.group(d.elements, ids)));
        set((s) => ({ selected: groups.withGroups(s.design.elements, ids) }));
      },
      ungroup: (ids) => get().update((d) => void (d.elements = groups.ungroup(d.elements, ids))),
      renameGroup: (groupId, name) => get().update((d) => void (d.elements = groups.renameGroup(d.elements, groupId, name))),

      openPage: (i) => set((s) => ((s.design.page ?? 0) === i ? s : { design: pages.goToPage(s.design, i), dirty: true, selected: [] })),
      addPage: (copy) => set((s) => ({ design: pages.addPage(s.design, copy), dirty: true, selected: [] })),
      removePage: (i) => set((s) => ({ design: pages.removePage(s.design, i), dirty: true, selected: [] })),
      movePage: (from, to) => set((s) => ({ design: pages.movePage(s.design, from, to), dirty: true })),
    }),
    {
      limit: 150,
      partialize: (s) => ({ design: s.design }),
      equality: (a, b) => a.design === b.design,
      // Group rapid edits (slider drags, typing) into one undo step.
      handleSet: (handleSet) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let pending = false;
        return (...args: Parameters<typeof handleSet>) => {
          if (!pending) {
            handleSet(...args);
            pending = true;
          }
          clearTimeout(timer);
          timer = setTimeout(() => (pending = false), 400);
        };
      },
    },
  ),
);

export const undo = () => useDesign.temporal.getState().undo();
export const redo = () => useDesign.temporal.getState().redo();

/** Runs `fn` (e.g. an AI job) as a single undo step. */
export async function asOneStep<T>(fn: () => Promise<T>): Promise<T> {
  const t = useDesign.temporal;
  const before = useDesign.getState().design;
  t.getState().pause();
  try {
    return await fn();
  } finally {
    t.getState().resume();
    if (useDesign.getState().design !== before) {
      t.setState((s) => ({ pastStates: [...s.pastStates, { design: before }].slice(-150), futureStates: [] }));
    }
  }
}

export const selectedEls = (s: DesignState) => s.design.elements.filter((e) => s.selected.includes(e.id));
