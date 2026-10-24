// Pure geometry shared by the canvas, snapping and SVG export.
import type { Crop, El, LinearGradient, Mask } from "../types/design";

/** Gradient line endpoints for a w×h box, CSS-like: 0° runs left → right, 90° top → bottom. */
export function gradientPoints(g: LinearGradient, w: number, h: number) {
  const a = (g.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // Half-length so the gradient spans the whole box at any angle.
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return { start: { x: cx - dx * half, y: cy - dy * half }, end: { x: cx + dx * half, y: cy + dy * half } };
}

export const colorStops = (g: LinearGradient): (number | string)[] =>
  g.colors.flatMap((c, i) => [g.colors.length === 1 ? 0 : i / (g.colors.length - 1), c]);

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned bounds of an element, accounting for rotation around its top-left corner. */
export function bounds(e: Pick<El, "x" | "y" | "w" | "h" | "rotation">): Box {
  if (!e.rotation) return { x: e.x, y: e.y, w: e.w, h: e.h };
  const a = (e.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const pts = [[0, 0], [e.w, 0], [e.w, e.h], [0, e.h]].map(([px, py]) => [e.x + px * cos - py * sin, e.y + px * sin + py * cos]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export interface Guide {
  orientation: "v" | "h";
  /** Page coordinate of the line. */
  pos: number;
}

/**
 * Snaps a moving box to the page edges/center and to other boxes' edges/centers.
 * Returns the offset to apply and the guides to draw.
 */
export function snap(moving: Box, targets: Box[], page: { width: number; height: number }, threshold: number) {
  const vLines = [0, page.width / 2, page.width];
  const hLines = [0, page.height / 2, page.height];
  for (const t of targets) {
    vLines.push(t.x, t.x + t.w / 2, t.x + t.w);
    hLines.push(t.y, t.y + t.h / 2, t.y + t.h);
  }
  const best = (edges: number[], lines: number[]) => {
    let hit: { delta: number; pos: number } | null = null;
    for (const edge of edges)
      for (const line of lines) {
        const d = line - edge;
        if (Math.abs(d) <= threshold && (!hit || Math.abs(d) < Math.abs(hit.delta))) hit = { delta: d, pos: line };
      }
    return hit;
  };
  const vx = best([moving.x, moving.x + moving.w / 2, moving.x + moving.w], vLines);
  const hy = best([moving.y, moving.y + moving.h / 2, moving.y + moving.h], hLines);
  const guides: Guide[] = [];
  if (vx) guides.push({ orientation: "v", pos: vx.pos });
  if (hy) guides.push({ orientation: "h", pos: hy.pos });
  return { dx: vx?.delta ?? 0, dy: hy?.delta ?? 0, guides };
}

/** Closed polygon points (x0, y0, x1, y1, …) for polygon shapes drawn inside a w×h box. */
export function polygonPoints(shape: "triangle" | "star", w: number, h: number): number[] {
  if (shape === "triangle") return [w / 2, 0, w, h, 0, h];
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a));
  }
  return pts;
}

/** Text height for `lines` lines, as the canvas lays it out. */
export const textHeight = (lines: number, fontSize: number, lineHeight: number) => Math.max(1, lines) * fontSize * lineHeight;

/**
 * Source rectangle of an iw×ih image shown in a w×h box: it covers the box
 * without stretching (object-fit: cover), zoomed and positioned by `crop`.
 * `scale` is box pixels per image pixel.
 */
export function imageCrop(iw: number, ih: number, w: number, h: number, crop?: Crop) {
  const scale = Math.max(w / iw, h / ih) * (crop?.zoom ?? 1);
  const cw = w / scale;
  const ch = h / scale;
  return { x: (iw - cw) * (crop?.x ?? 0.5), y: (ih - ch) * (crop?.y ?? 0.5), width: cw, height: ch, scale };
}

/** A unit-square path (0…1) for shapes that are not polygons, scaled by `maskPath`. */
const UNIT_PATHS = {
  heart: "M.5 .95C.2 .74 0 .55 0 .32 0 .14 .14 0 .3 0 .4 0 .47 .05 .5 .12 .53 .05 .6 0 .7 0 .86 0 1 .14 1 .32 1 .55 .8 .74 .5 .95Z",
  blob: "M.52 .02C.72 .02 .93 .12 .98 .34 1.03 .55 .9 .72 .78 .85 .64 .99 .43 1.02 .26 .93 .09 .84-.02 .66 .01 .45 .04 .24 .16 .05 .35 .02 .41 .01 .46 .02 .52 .02Z",
};

/** Outline of a photo frame shape in a w×h box, as SVG path data. */
export function maskPath(mask: Mask, w: number, h: number): string {
  const poly = (pts: number[]) => {
    let d = "";
    for (let i = 0; i < pts.length; i += 2) d += `${i ? "L" : "M"}${pts[i]} ${pts[i + 1]}`;
    return `${d}Z`;
  };
  switch (mask) {
    case "circle":
      return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z`;
    case "arch": {
      const r = Math.min(w / 2, h);
      return `M0 ${h}V${r}A${w / 2} ${r} 0 0 1 ${w} ${r}V${h}Z`;
    }
    case "triangle":
    case "star":
      return poly(polygonPoints(mask, w, h));
    case "hexagon":
      return poly([w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2]);
    default:
      // Scale the unit path's numbers: x and y alternate within each command.
      return scaleUnitPath(UNIT_PATHS[mask], w, h);
  }
}

/** Scales a path written only with absolute M/C/L/Z commands in 0…1 units. */
function scaleUnitPath(d: string, w: number, h: number): string {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (num) => String(Math.round(Number(num) * (i++ % 2 === 0 ? w : h) * 100) / 100));
}
