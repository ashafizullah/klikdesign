// Copy and paste. Elements live in an in-app clipboard; copying them also puts
// their text on the system clipboard, so whatever was copied last (here or in
// another app: a screenshot, an image file, some text) is what pastes.
import type { El } from "../types/design";
import { normalizeElement } from "../types/design";
import { TEXT_PRESETS, placeOnPage } from "./templates";
import { useDesign } from "../store/design";
import { regroup } from "./groups";
import { ensureFont } from "./fonts";
import { ipc } from "./ipc";
import { importImages, mediaChanged, placeImage } from "./media";

let copied: El[] = [];
/** What copying elements wrote to the system clipboard, to recognise it when pasting. */
let mark = "";

const textOf = (els: El[]) =>
  els
    .flatMap((e) => (e.type === "text" ? [e.text] : []))
    .join("\n")
    .trim();

export async function copyElements(ids: string[]) {
  const { elements } = useDesign.getState().design;
  copied = structuredClone(elements.filter((e) => ids.includes(e.id)));
  // Never empty, so an image copied earlier in another app is replaced.
  mark = textOf(copied) || copied.map((e) => e.name || e.type).join(", ");
  await ipc.clipboardWrite(mark).catch(() => {}); // the in-app copy still works
}

export function pasteElements() {
  if (!copied.length) return;
  const store = useDesign.getState();
  store.add(regroup(copied, copied).map(({ id: _id, ...x }) => ({ ...structuredClone(x), x: x.x + 24, y: x.y + 24, locked: undefined })));
  copied = copied.map((x) => ({ ...x, x: x.x + 24, y: x.y + 24 }));
}

/** Pastes the system clipboard's image or text (centered on `at`, page coords), or else the copied elements. */
export async function paste(at?: { x: number; y: number }) {
  const clip = await ipc.clipboardRead(useDesign.getState().design.id).catch(() => ({ kind: "empty" }) as const);
  if (clip.kind === "files") return importImages(clip.paths, at);
  if (clip.kind === "image") {
    mediaChanged();
    return placeImage(clip.path, at);
  }
  if (clip.kind === "text" && clip.text.trim() !== mark) {
    // Text copied in another app becomes a body text box.
    const { design, add } = useDesign.getState();
    const body = TEXT_PRESETS.find((p) => p.id === "body")!.el;
    const el = normalizeElement(placeOnPage({ ...body, w: 800, text: clip.text.trim().slice(0, 5000) }, design), "");
    if (el?.type !== "text") return;
    void ensureFont(el.fontFamily);
    const { id: _id, ...rest } = el;
    add([at ? { ...rest, x: at.x - rest.w / 2, y: at.y } : rest]);
    return;
  }
  pasteElements();
}
