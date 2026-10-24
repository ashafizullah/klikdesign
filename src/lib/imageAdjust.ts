// Photo adjustments (brightness, contrast, saturation) applied to the pixels
// once and cached, rather than as a canvas filter: canvas filters are missing
// from older WebKit (the macOS webview), and Konva's filters need a cached
// node that would export blurry.
import { useEffect, useState } from "react";
import type { Adjust } from "../types/design";

/** Adjusted copies are capped at this many pixels on their long side. */
const MAX_SIDE = 3000;

const cache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

/** Lookup table for brightness and contrast, per 0–255 channel value. */
export function toneTable(brightness: number, contrast: number): Uint8ClampedArray {
  const b = 1 + (brightness / 100) * 0.6;
  const c = 1 + (contrast / 100) * 0.8;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v * b - 128) * c + 128;
  return lut;
}

/** Applies `adjust` to RGBA pixels in place. */
export function adjustPixels(px: Uint8ClampedArray, adjust: Adjust) {
  const lut = toneTable(adjust.brightness, adjust.contrast);
  const s = 1 + adjust.saturation / 100;
  for (let i = 0; i < px.length; i += 4) {
    const r = lut[px[i]];
    const g = lut[px[i + 1]];
    const b = lut[px[i + 2]];
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    px[i] = gray + (r - gray) * s;
    px[i + 1] = gray + (g - gray) * s;
    px[i + 2] = gray + (b - gray) * s;
  }
}

export const adjustKey = (a: Adjust) => `${a.brightness}|${a.contrast}|${a.saturation}`;

/** An adjusted copy of `img` (cached per setting). */
export function adjustedImage(img: HTMLImageElement, adjust: Adjust): HTMLCanvasElement {
  let byKey = cache.get(img);
  if (!byKey) cache.set(img, (byKey = new Map()));
  const key = adjustKey(adjust);
  const hit = byKey.get(key);
  if (hit) return hit;
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((img.naturalWidth || MAX_SIDE) * k));
  c.height = Math.max(1, Math.round((img.naturalHeight || MAX_SIDE) * k));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  adjustPixels(data.data, adjust);
  ctx.putImageData(data, 0, 0);
  // Keep the last few settings: slider drags produce many.
  if (byKey.size > 4) byKey.delete(byKey.keys().next().value!);
  byKey.set(key, c);
  return c;
}

/**
 * The image with `adjust` applied, or the image itself without adjustments.
 * While a new setting is computed (slider drags) the previous result stays.
 */
export function useAdjusted(img: HTMLImageElement | null, adjust: Adjust | undefined): HTMLImageElement | HTMLCanvasElement | null {
  const [out, setOut] = useState<HTMLImageElement | HTMLCanvasElement | null>(img);
  const key = adjust ? adjustKey(adjust) : "";
  useEffect(() => {
    if (!img || !adjust) return setOut(img);
    // Let the slider repaint before the pixels are worked through.
    const t = setTimeout(() => setOut(adjustedImage(img, adjust)), 16);
    return () => clearTimeout(t);
  }, [img, key]);
  return out;
}

/** Natural size of an image or canvas. */
export const sizeOf = (src: HTMLImageElement | HTMLCanvasElement) =>
  src instanceof HTMLImageElement ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };
