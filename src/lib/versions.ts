// Version history: snapshots of the whole design (every page) kept with it, so
// earlier states survive closing the app, unlike undo. Snapshots are taken when
// a design opens, before the AI or Claude Code edits it, every few minutes of
// editing, before a restore, and when the user saves one by hand.
import { create } from "zustand";
import type { Design } from "../types/design";
import { normalizeDesign, useDesign } from "../store/design";
import { pageCount } from "./pages";
import { ipc } from "./ipc";
import { renderPage, stageReady } from "./stage";
import { ensureFonts } from "./fonts";

export type VersionKind = "manual" | "open" | "ai" | "auto" | "restore";

export interface VersionMeta {
  id: string;
  at: number;
  label: string;
  kind: VersionKind;
  hash: string;
  pages: number;
  thumb?: string | null;
}

/** Editing time between automatic snapshots. */
const AUTO_EVERY = 10 * 60_000;
/** Claude Code edits in many small calls: one snapshot per burst. */
const EXTERNAL_EVERY = 3 * 60_000;

/** Bumps when a design's versions change, so the history list reloads. */
export const useVersions = create<{ version: number }>()(() => ({ version: 0 }));

/** The newest snapshot of the open design. */
let last: { designId: string; hash: string; at: number } | null = null;

/** A short, stable hash of a string (cyrb53). */
export function hashOf(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const hasContent = (d: Design) => d.elements.length > 0 || (d.pages ?? []).some((p) => p.elements.length > 0);

function thumbnail(d: Design): string | undefined {
  if (!stageReady()) return undefined;
  try {
    return renderPage(Math.min(1, 360 / Math.max(d.width, d.height)), "image/jpeg", 0.75);
  } catch {
    return undefined;
  }
}

/**
 * Saves the open design as a version, unless it is empty or unchanged since
 * the last one (a version saved by hand is always kept).
 */
export async function snapshot(kind: VersionKind, label = ""): Promise<VersionMeta | null> {
  const design = useDesign.getState().design;
  if (kind !== "manual" && !hasContent(design)) return null;
  const json = JSON.stringify(design);
  const hash = hashOf(json);
  if (kind !== "manual" && last?.designId === design.id && last.hash === hash) return null;
  const meta = await ipc.versionSave(design.id, { label: label.trim().slice(0, 120), kind, hash, pages: pageCount(design), thumb: thumbnail(design) ?? null }, json);
  last = { designId: design.id, hash, at: meta.at };
  useVersions.setState((s) => ({ version: s.version + 1 }));
  return meta;
}

/** On opening a design: remembers its newest version, then snapshots it if it changed since. */
export async function versionsOnOpen(designId: string) {
  last = null;
  const [newest] = await ipc.versions(designId);
  if (newest) last = { designId, hash: newest.hash, at: newest.at };
  await snapshot("open");
}

/** After an autosave: a snapshot every few minutes of editing. */
export async function maybeAutoSnapshot() {
  const { design } = useDesign.getState();
  if (last?.designId === design.id && Date.now() - last.at < AUTO_EVERY) return;
  await snapshot("auto");
}

/** Before Claude Code (MCP) changes the design: one snapshot per burst of calls. */
export async function snapshotBeforeExternal() {
  const { design } = useDesign.getState();
  if (last?.designId === design.id && Date.now() - last.at < EXTERNAL_EVERY) return;
  await snapshot("ai", "Claude Code");
}

/**
 * Replaces the open design's content with version `id` (as one undo step),
 * after snapshotting the current state so the restore can be reverted too.
 * The design keeps its id, name and linked project folder.
 */
export async function restoreVersion(id: string) {
  const { design } = useDesign.getState();
  const restored = normalizeDesign(JSON.parse(await ipc.versionLoad(design.id, id)) as Partial<Design>);
  await snapshot("restore");
  useDesign.getState().update((d) => {
    const keep = { id: d.id, name: d.name, workspaceId: d.workspaceId };
    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
    Object.assign(d, restored, keep);
  });
  useDesign.getState().select([]);
  const all = [restored.elements, ...(restored.pages ?? []).map((p) => p.elements)].flat();
  void ensureFonts(all.flatMap((e) => (e.type === "text" ? [e.fontFamily] : [])));
}

export async function deleteVersion(id: string) {
  await ipc.versionDelete(useDesign.getState().design.id, id);
  useVersions.setState((s) => ({ version: s.version + 1 }));
}
