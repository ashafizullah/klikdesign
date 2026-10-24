// Imported images are loaded as blob URLs (not the asset protocol) so the
// canvas stays same-origin and can be exported.
import { useEffect, useState } from "react";
import { ipc } from "./ipc";

const cache = new Map<string, Promise<HTMLImageElement>>();

function mime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext ?? "png"}`;
}

export function loadImage(path: string): Promise<HTMLImageElement> {
  return cached(path, () => ipc.mediaBytes(path));
}

/** An image inside a linked project folder (read through the sandboxed workspace commands). */
export function loadWorkspaceImage(workspaceId: string, rel: string): Promise<HTMLImageElement> {
  return cached(`ws:${workspaceId}:${rel}`, () => ipc.wsImageBytes(workspaceId, rel));
}

function cached(key: string, fetchBytes: () => Promise<ArrayBuffer>): Promise<HTMLImageElement> {
  let p = cache.get(key);
  if (!p) {
    p = fetchBytes().then(
      (bytes) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Could not load image ${key.replace(/^ws:[^:]+:/, "")}`));
          img.src = URL.createObjectURL(new Blob([bytes], { type: mime(key) }));
        }),
    );
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Loads `path`; an empty path loads nothing. */
export function useImage(path: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!path) return setImg(null);
    let live = true;
    loadImage(path).then((i) => live && setImg(i), () => live && setImg(null));
    return () => void (live = false);
  }, [path]);
  return img;
}

/** The image as a data URI (for SVG export). */
export async function imageDataUri(path: string): Promise<string> {
  const img = await loadImage(path);
  const blob = await (await fetch(img.src)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** The image downscaled to `max` px as base64 JPEG (for showing it to a vision model). */
export function jpegBase64(img: HTMLImageElement, max = 1024): string {
  const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((img.naturalWidth || max) * k));
  c.height = Math.max(1, Math.round((img.naturalHeight || max) * k));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return url.slice(url.indexOf(",") + 1);
}
