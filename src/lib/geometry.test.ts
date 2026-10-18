import { expect, test } from "bun:test";
import { bounds, gradientPoints, polygonPoints, snap } from "./geometry";

test("bounds of a rotated box contain all corners", () => {
  expect(bounds({ x: 10, y: 20, w: 100, h: 50, rotation: 0 })).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  const b = bounds({ x: 0, y: 0, w: 100, h: 50, rotation: 90 });
  expect(b.x).toBeCloseTo(-50);
  expect(b.w).toBeCloseTo(50);
  expect(b.h).toBeCloseTo(100);
});

test("gradient spans the box along its angle", () => {
  const h = gradientPoints({ kind: "linear", angle: 0, colors: ["#000", "#fff"] }, 200, 100);
  expect(h.start).toEqual({ x: 0, y: 50 });
  expect(h.end).toEqual({ x: 200, y: 50 });
  const v = gradientPoints({ kind: "linear", angle: 90, colors: ["#000", "#fff"] }, 200, 100);
  expect(v.start.y).toBeCloseTo(0);
  expect(v.end.y).toBeCloseTo(100);
});

test("snap pulls a box to the page center and reports a guide", () => {
  const page = { width: 1000, height: 1000 };
  const s = snap({ x: 447, y: 10, w: 100, h: 100 }, [], page, 6);
  expect(s.dx).toBe(3);
  expect(s.guides).toContainEqual({ orientation: "v", pos: 500 });
  const none = snap({ x: 300, y: 300, w: 10, h: 10 }, [], page, 6);
  expect(none).toEqual({ dx: 0, dy: 0, guides: [] });
});

test("snap aligns to another element's edge", () => {
  const s = snap({ x: 104, y: 400, w: 50, h: 50 }, [{ x: 100, y: 0, w: 80, h: 80 }], { width: 1000, height: 1000 }, 6);
  expect(s.dx).toBe(-4);
});

test("polygons stay inside their box", () => {
  for (const shape of ["triangle", "star"] as const) {
    const pts = polygonPoints(shape, 200, 100);
    pts.forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual((i % 2 ? 100 : 200) + 1e-9);
    });
  }
});
