// The live Konva stage, registered by the canvas so export and thumbnails can
// render the page without the selection UI.
import type Konva from "konva";
import { useDesign } from "../store/design";

let current: { stage: Konva.Stage; page: Konva.Group } | null = null;

export function registerStage(stage: Konva.Stage | null, page: Konva.Group | null) {
  current = stage && page ? { stage, page } : null;
}

/** The page at `scale` page-pixels per design pixel, as a data URL. */
export function renderPage(scale: number, mimeType = "image/png", quality = 0.92): string {
  if (!current) throw new Error("The canvas is not ready");
  const { page } = current;
  const { width, height } = useDesign.getState().design;
  const zoom = page.getAbsoluteScale().x;
  const pos = page.getAbsolutePosition();
  return page.toDataURL({ x: pos.x, y: pos.y, width: width * zoom, height: height * zoom, pixelRatio: scale / zoom, mimeType, quality });
}

/** Wrapped lines of every text element, exactly as the canvas laid them out. */
export function textLines(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!current) return out;
  for (const node of current.page.find("Text")) {
    const id = node.getAttr("elId") as string | undefined;
    const arr = (node as unknown as { textArr: { text: string }[] }).textArr;
    if (id && arr) out[id] = arr.map((l) => l.text);
  }
  return out;
}

export const stageReady = () => !!current;
