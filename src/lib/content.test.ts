import { expect, test } from "bun:test";
import { icons } from "lucide";
import { normalizeElement } from "../types/design";
import { normalizeDesign } from "../store/design";
import { POPULAR, kebab, searchIcons, toPath, type IconNode } from "./icons";
import { parseWaLink, qrPath, waLink } from "./qr";
import { maskPath } from "./geometry";
import { adjustPixels, toneTable } from "./imageAdjust";
import { designToSvg } from "./svg";

test("icon names and shapes become path data", () => {
  expect(kebab("MapPin")).toBe("map-pin");
  expect(kebab("Grid2x2")).toBe("grid-2x2");
  expect(toPath(["circle", { cx: 12, cy: 12, r: 10 }])).toBe("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0");
  expect(toPath(["line", { x1: 1, y1: 2, x2: 3, y2: 4 }])).toBe("M1 2L3 4");
  expect(toPath(["polyline", { points: "1 2 3 4" }])).toBe("M1 2L3 4");
  expect(toPath(["rect", { x: 0, y: 0, width: 10, height: 10, rx: 2 }])).toContain("a2 2 0 0 1");
  // Every tag Lucide uses converts.
  const lib = Object.fromEntries(Object.entries(icons as unknown as Record<string, IconNode>).map(([k, v]) => [kebab(k), v]));
  expect(Object.values(lib).every((node) => node.every((part) => toPath(part) !== ""))).toBe(true);
  expect(searchIcons(lib, "map pin")[0]).toBe("map-pin");
  // The suggestions shown before searching all exist.
  expect(searchIcons(lib, "")).toEqual(POPULAR);
});

test("QR codes, WhatsApp links", () => {
  const qr = qrPath("https://example.com")!;
  expect(qr.size).toBe(25 + 4); // version 2 at level M, plus the quiet zone
  expect(qr.path.startsWith("M2 2h7")).toBe(true); // the top-left finder pattern
  expect(qrPath("x".repeat(3000))).toBeNull();
  expect(waLink("0812-3456 7890", "Halo kak!")).toBe("https://wa.me/6281234567890?text=Halo%20kak!");
  expect(parseWaLink("https://wa.me/6281234567890?text=Halo%20kak!")).toEqual({ phone: "6281234567890", text: "Halo kak!" });
  expect(parseWaLink(waLink("0812", "Halo, "))?.text).toBe("Halo, ");
  expect(parseWaLink("https://example.com")).toBeNull();
});

test("frame shapes and photo adjustments", () => {
  expect(maskPath("circle", 100, 50)).toBe("M0 25A50 25 0 1 0 100 25A50 25 0 1 0 0 25Z");
  expect(maskPath("heart", 100, 100).startsWith("M50 95C20 74")).toBe(true);
  expect(toneTable(0, 0)[200]).toBe(200);
  const px = new Uint8ClampedArray([200, 100, 50, 255]);
  adjustPixels(px, { brightness: 0, contrast: 0, saturation: -100 });
  expect(px[0]).toBe(px[1]);
  expect(px[1]).toBe(px[2]);
  expect(px[3]).toBe(255);
});

test("new elements normalize and export to SVG", () => {
  expect(normalizeElement({ type: "icon", icon: "../x" }, "i")).toBeNull();
  expect(normalizeElement({ type: "qr", data: "x", w: 300, h: 100 }, "q")).toMatchObject({ w: 300, h: 300, background: "#ffffff" });
  const img = normalizeElement({ type: "image", src: "a.png", mask: "heart", adjust: { brightness: 0, contrast: 0, saturation: 0 }, overlay: { color: "#000", opacity: 0.5 } }, "p");
  expect(img).toMatchObject({ mask: "heart", adjust: undefined, overlay: { color: "#000", opacity: 0.5 } });

  const d = normalizeDesign({
    elements: [
      { id: "i", type: "icon", icon: "phone", x: 0, y: 0, w: 48, h: 48, color: "#ff0000" },
      { id: "q", type: "qr", data: "https://example.com", x: 0, y: 0, w: 290, h: 290 },
      { id: "p", type: "image", src: "/a.png", x: 0, y: 0, w: 100, h: 100, mask: "circle", overlay: { color: "#000000", opacity: 0.4 } },
    ] as never,
  });
  const svg = designToSvg(d, { lines: {}, images: { "/a.png": "data:x" }, icons: { phone: ["M1 1L2 2"] } });
  expect(svg).toContain('<g transform="scale(2 2)" fill="none" stroke="#ff0000"');
  expect(svg).toContain('<path transform="scale(10)" d="M2 2h7');
  expect(svg).toContain('<clipPath id="c');
  expect(svg).toContain('opacity="0.4"');
});
