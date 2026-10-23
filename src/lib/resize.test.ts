import { expect, test } from "bun:test";
import { normalizeDesign } from "../store/design";
import { resizeLayout } from "./resize";

const post = normalizeDesign({
  width: 1080,
  height: 1350,
  elements: [
    { id: "bg", type: "shape", shape: "rect", x: 0, y: 0, w: 1080, h: 1350, fill: "#111" },
    { id: "photo", type: "image", src: "/m/a.png", x: 0, y: 0, w: 1080, h: 1350 },
    { id: "title", type: "text", text: "Hi", x: 90, y: 100, w: 900, h: 120, fontSize: 100, letterSpacing: 2 },
    { id: "logo", type: "shape", shape: "ellipse", x: 900, y: 1200, w: 100, h: 100, fill: "#fff", strokeWidth: 4, stroke: "#000" },
  ] as never,
});

test("backgrounds stretch, content keeps proportions inside the new page", () => {
  const r = resizeLayout(post, 1920, 1080); // portrait post -> landscape banner
  const by = Object.fromEntries(r.elements.map((e) => [e.id, e]));
  expect([r.width, r.height]).toEqual([1920, 1080]);
  expect(by.bg).toMatchObject({ x: 0, y: 0, w: 1920, h: 1080 });
  // The photo covers the page at its own aspect ratio, centered.
  expect(by.photo.w / by.photo.h).toBeCloseTo(1080 / 1350, 2);
  expect(by.photo.w).toBeGreaterThanOrEqual(1920);
  expect(by.photo.x + by.photo.w / 2).toBeCloseTo(960, 0);

  const s = 1080 / 1350;
  expect(by.title).toMatchObject({ w: 720, fontSize: 80, letterSpacing: 1.6 });
  expect(by.title.x + by.title.w / 2).toBeCloseTo(540 * (1920 / 1080), 0);
  expect(by.logo.w).toBeCloseTo(100 * s, 1);
  expect(by.logo.type === "shape" && by.logo.strokeWidth).toBeCloseTo(4 * s, 1);
  for (const e of [by.title, by.logo]) {
    expect(e.x).toBeGreaterThanOrEqual(0);
    expect(e.x + e.w).toBeLessThanOrEqual(1920);
    expect(e.y + e.h).toBeLessThanOrEqual(1080);
  }
});

test("same size is a no-op on geometry", () => {
  const r = resizeLayout(post, 1080, 1350);
  expect(r.elements.map((e) => [e.x, e.y, e.w, e.h])).toEqual(post.elements.map((e) => [e.x, e.y, e.w, e.h]));
});
