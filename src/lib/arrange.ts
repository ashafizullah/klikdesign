// Aligning and distributing boxes. Pure: callers measure the boxes (text uses
// its laid-out height) and apply the returned offsets to the elements.
import type { Box } from "./geometry";

export type AlignMode = "l" | "c" | "r" | "t" | "m" | "b";

/** Union of `boxes`. */
export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** Offset that aligns `b` to `area`. */
export function alignOffset(b: Box, area: Box, mode: AlignMode) {
  const dx = mode === "l" ? area.x - b.x : mode === "c" ? area.x + area.w / 2 - (b.x + b.w / 2) : mode === "r" ? area.x + area.w - (b.x + b.w) : 0;
  const dy = mode === "t" ? area.y - b.y : mode === "m" ? area.y + area.h / 2 - (b.y + b.h / 2) : mode === "b" ? area.y + area.h - (b.y + b.h) : 0;
  return { dx, dy };
}

/**
 * Offsets that space `boxes` evenly along an axis: the outermost stay put and
 * the gaps between neighbours become equal. Returned in the input order.
 */
export function distributeOffsets(boxes: Box[], axis: "x" | "y") {
  const size = axis === "x" ? "w" : "h";
  const order = boxes.map((b, i) => ({ b, i })).sort((p, q) => p.b[axis] - q.b[axis] || p.i - q.i);
  const out = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (boxes.length < 3) return out;
  const start = order[0].b[axis];
  const end = Math.max(...boxes.map((b) => b[axis] + b[size]));
  const gap = (end - start - boxes.reduce((s, b) => s + b[size], 0)) / (boxes.length - 1);
  let at = start;
  for (const { b, i } of order) {
    const d = at - b[axis];
    out[i] = axis === "x" ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    at += b[size] + gap;
  }
  return out;
}
