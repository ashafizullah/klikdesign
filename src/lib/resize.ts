// Magic resize, step one: fit an existing layout to a new page size without
// the AI. Backgrounds stretch to the new page; everything else keeps its
// proportions, scales by the smaller axis factor (so nothing overflows) and
// stays centered where it was, relative to the page.
import type { Design, El } from "../types/design";

const round = (v: number) => Math.round(v * 10) / 10;

/** Covers (nearly) the whole page, like a background panel or photo. */
function isBackdrop(e: El, d: Design): boolean {
  return e.type !== "text" && e.w >= d.width * 0.9 && e.h >= d.height * 0.9;
}

export function resizeLayout(d: Design, width: number, height: number): Design {
  const sx = width / d.width;
  const sy = height / d.height;
  const s = Math.min(sx, sy);
  const elements = d.elements.map((e): El => {
    if (isBackdrop(e, d)) {
      if (e.type === "image") {
        // Keep the photo's aspect: cover the new page and center it.
        const k = Math.max(sx, sy);
        const w = e.w * k;
        const h = e.h * k;
        return { ...e, w: round(w), h: round(h), x: round((e.x + e.w / 2) * sx - w / 2), y: round((e.y + e.h / 2) * sy - h / 2) };
      }
      return { ...e, x: round(e.x * sx), y: round(e.y * sy), w: round(e.w * sx), h: round(e.h * sy) };
    }
    const w = e.w * s;
    const h = e.h * s;
    let x = (e.x + e.w / 2) * sx - w / 2;
    let y = (e.y + e.h / 2) * sy - h / 2;
    // Pull elements that started inside the page back inside it.
    const inside = e.x >= 0 && e.y >= 0 && e.x + e.w <= d.width && e.y + e.h <= d.height;
    if (inside) {
      x = Math.min(Math.max(0, x), Math.max(0, width - w));
      y = Math.min(Math.max(0, y), Math.max(0, height - h));
    }
    const shadow = e.shadow && { ...e.shadow, blur: round(e.shadow.blur * s), offsetX: round(e.shadow.offsetX * s), offsetY: round(e.shadow.offsetY * s) };
    const common = { x: round(x), y: round(y), w: round(w), h: round(h), shadow };
    const stroke = e.type !== "image" && e.strokeWidth ? { strokeWidth: round(e.strokeWidth * s) } : {};
    if (e.type === "text") {
      return { ...e, ...common, ...stroke, fontSize: Math.max(4, round(e.fontSize * s)), letterSpacing: round(e.letterSpacing * s) };
    }
    const cornerRadius = e.cornerRadius ? { cornerRadius: round(e.cornerRadius * s) } : {};
    return { ...e, ...common, ...stroke, ...cornerRadius };
  });
  return { ...d, width: Math.round(width), height: Math.round(height), elements };
}
