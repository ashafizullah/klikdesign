// Magic resize: fit the open design to another size, as a copy or in place,
// then optionally ask the AI to re-lay it out for the new format.
import { useDesign } from "../store/design";
import { useChat } from "../store/chat";
import { useUi } from "../store/ui";
import { t } from "../i18n";
import { ipc } from "./ipc";
import { createDesign, leaveDesign, saveNow } from "./library";
import { mediaChanged } from "./media";
import { resizeLayout } from "./resize";
import { sendChat } from "./chat";
import { isUntitled } from "./agent";

export interface ResizeOptions {
  width: number;
  height: number;
  /** Shown in the copy's name, e.g. "Story". */
  label: string;
  /** Make a new design and keep the original. */
  copy: boolean;
  /** Ask the AI to re-lay out the result. */
  ai: boolean;
}

export async function magicResize(o: ResizeOptions): Promise<void> {
  // The AI edits whichever design is open, so switching mid-job would corrupt the next one.
  if (useChat.getState().busy) throw new Error(t("top.backBusy"));
  const cur = useDesign.getState().design;
  const next = resizeLayout(cur, o.width, o.height);
  if (o.copy) {
    await leaveDesign();
    const { id: _id, ...rest } = next;
    // An untitled original gives an untitled copy, so the AI can still name it.
    const name = isUntitled(cur.name) ? t("home.untitled") : t("resize.copyName", { name: cur.name, size: o.label });
    await createDesign({ ...rest, name });
    // Images belong to their design's folder: copy them so the copy stands on its own.
    const id = useDesign.getState().design.id;
    const moved = new Map<string, string>();
    const all = [next.elements, ...(next.pages ?? []).map((p) => p.elements)].flat();
    for (const src of new Set(all.flatMap((e) => (e.type === "image" ? [e.src] : [])))) {
      moved.set(src, await ipc.mediaImport(id, src).catch(() => src));
    }
    if (moved.size) {
      useDesign.getState().update((d) =>
        [d.elements, ...(d.pages ?? []).map((p) => p.elements)].flat().forEach((e) => e.type === "image" && (e.src = moved.get(e.src) ?? e.src)),
      );
      useDesign.temporal.getState().clear();
      await saveNow();
      mediaChanged();
    }
  } else {
    useDesign.getState().update((d) => Object.assign(d, { width: next.width, height: next.height, elements: next.elements, pages: next.pages }));
    useUi.getState().setZoom(null);
  }
  if (o.ai && next.elements.length) {
    useUi.getState().setRightTab("ai");
    void sendChat(t("resize.aiPrompt", { from: `${cur.width}×${cur.height}`, to: `${next.width}×${next.height}` }));
  }
}
