// Images stored with the open design (its media folder), as opposed to the
// linked project folder: uploading, dropping files and placing them.
import { create } from "zustand";
import { useDesign } from "../store/design";
import { ipc } from "./ipc";
import { loadImage } from "./images";

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

export const isImagePath = (p: string) => IMAGE_EXTS.includes(p.split(".").pop()?.toLowerCase() ?? "");

/** Bumps when the design's media folder changes, so its image list reloads. */
export const useMedia = create<{ version: number }>()(() => ({ version: 0 }));
export const mediaChanged = () => useMedia.setState((s) => ({ version: s.version + 1 }));

/** Adds an image at its aspect ratio, fitted to 60% of the page, centered on `at` (page coords) or the page. */
export async function placeImage(src: string, at?: { x: number; y: number }) {
  const img = await loadImage(src);
  const { design, add } = useDesign.getState();
  const k = Math.min((design.width * 0.6) / img.naturalWidth, (design.height * 0.6) / img.naturalHeight, 1);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  const c = at ?? { x: design.width / 2, y: design.height / 2 };
  add([{ type: "image", src, x: c.x - w / 2, y: c.y - h / 2, w, h, rotation: 0, opacity: 1 }]);
}

/** Copies image files into the design's media folder and places each one (offset so they don't stack exactly). */
export async function importImages(paths: string[], at?: { x: number; y: number }) {
  const id = useDesign.getState().design.id;
  try {
    for (const [i, p] of paths.filter(isImagePath).entries()) {
      const src = await ipc.mediaImport(id, p);
      await placeImage(src, at && { x: at.x + i * 24, y: at.y + i * 24 });
    }
  } finally {
    mediaChanged();
  }
}
