// Pure geometry shared by the canvas, snapping and SVG export.
import type { El, LinearGradient } from "../types/design";

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
