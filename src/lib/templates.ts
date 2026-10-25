// Built-in starting points. Elements are normalized (and given ids) on use.
import type { Design } from "../types/design";
import type { Key } from "../i18n";

type Raw = Record<string, unknown>;
export interface Template {
  id: string;
  name: Key;
  design: Omit<Partial<Design>, "elements"> & { width: number; height: number; elements: Raw[] };
}

const text = (o: Raw): Raw => ({ type: "text", fontFamily: "Inter", fontWeight: 400, align: "left", lineHeight: 1.2, letterSpacing: 0, rotation: 0, opacity: 1, h: 10, ...o });
const shape = (o: Raw): Raw => ({ type: "shape", shape: "rect", rotation: 0, opacity: 1, ...o });

export const TEMPLATES: Template[] = [
  {
    id: "event",
    name: "tpl.event",
    design: {
      width: 1080,
      height: 1350,
      background: { kind: "linear", angle: 120, colors: ["#0b1026", "#2b1a5a", "#7c5cff"] },
      elements: [
        shape({ shape: "ellipse", x: 620, y: -180, w: 640, h: 640, fill: { kind: "linear", angle: 90, colors: ["#22d3c5", "#7c5cff"] }, opacity: 0.55 }),
        shape({ shape: "ellipse", x: -220, y: 980, w: 520, h: 520, fill: "#ff3d9a", opacity: 0.35 }),
        text({ x: 90, y: 140, w: 600, text: "TECH MEETUP 2026", fontFamily: "Space Grotesk", fontSize: 34, fontWeight: 600, fill: "#22d3c5", letterSpacing: 6 }),
        text({ x: 90, y: 220, w: 900, text: "Build the Future with AI", fontFamily: "Poppins", fontSize: 128, fontWeight: 800, fill: "#ffffff", lineHeight: 1.02 }),
        text({ x: 90, y: 720, w: 760, text: "An evening of talks, demos and networking with builders from across the region.", fontSize: 36, fill: "#d6d8f5", lineHeight: 1.4 }),
        shape({ x: 90, y: 1040, w: 380, h: 104, fill: "#ffffff", cornerRadius: 52 }),
        text({ x: 90, y: 1072, w: 380, text: "Register free", fontFamily: "Poppins", fontSize: 34, fontWeight: 700, fill: "#2b1a5a", align: "center" }),
        text({ x: 530, y: 1050, w: 470, text: "Sat, 14 Nov · 19:00\nJakarta Creative Hub", fontSize: 30, fontWeight: 500, fill: "#ffffff", lineHeight: 1.4 }),
      ],
    },
  },
  {
    id: "sale",
    name: "tpl.sale",
    design: {
      width: 1080,
      height: 1080,
      background: "#ffd23f",
      elements: [
        text({ x: 80, y: 120, w: 520, text: "WEEKEND", fontFamily: "Bebas Neue", fontSize: 110, fill: "#111111", letterSpacing: 4 }),
        text({ x: 72, y: 220, w: 940, text: "BIG SALE", fontFamily: "Anton", fontSize: 250, fill: "#111111", lineHeight: 1 }),
        shape({ shape: "line", x: 80, y: 560, w: 920, h: 20, stroke: "#111111", strokeWidth: 6 }),
        text({ x: 80, y: 620, w: 560, text: "All shoes, bags and accessories. Online and in store, 28–30 Nov.", fontFamily: "DM Sans", fontSize: 40, fill: "#111111", lineHeight: 1.35 }),
        shape({ shape: "star", x: 680, y: 600, w: 330, h: 330, fill: "#ff3d00" }),
        text({ x: 680, y: 717, w: 330, text: "50%\nOFF", fontFamily: "Anton", fontSize: 58, fill: "#ffffff", align: "center", lineHeight: 0.95 }),
        shape({ x: 80, y: 860, w: 440, h: 110, fill: "#111111", cornerRadius: 14 }),
        text({ x: 80, y: 892, w: 440, text: "SHOP NOW", fontFamily: "Bebas Neue", fontSize: 54, fill: "#ffd23f", align: "center", letterSpacing: 4 }),
      ],
    },
  },
  {
    id: "webinar",
    name: "tpl.webinar",
    design: {
      width: 1080,
      height: 1920,
      background: "#f4f1ea",
      elements: [
        shape({ x: 0, y: 0, w: 1080, h: 820, fill: "#0f3d3e" }),
        shape({ shape: "ellipse", x: 700, y: 520, w: 560, h: 560, fill: "#e2725b" }),
        text({ x: 90, y: 180, w: 700, text: "FREE WEBINAR", fontFamily: "Montserrat", fontSize: 36, fontWeight: 700, fill: "#e2725b", letterSpacing: 8 }),
        text({ x: 90, y: 260, w: 820, text: "Grow Your Small Business Online", fontFamily: "Playfair Display", fontSize: 110, fontWeight: 700, fill: "#f4f1ea", lineHeight: 1.08 }),
        text({ x: 90, y: 980, w: 860, text: "Learn practical marketing, payments and delivery tips you can use this week.", fontFamily: "Montserrat", fontSize: 44, fill: "#0f3d3e", lineHeight: 1.45 }),
        text({ x: 90, y: 1320, w: 860, text: "THURSDAY, 20 NOVEMBER\n10:00 – 11:30 WIB · ZOOM", fontFamily: "Montserrat", fontSize: 40, fontWeight: 700, fill: "#0f3d3e", lineHeight: 1.5, letterSpacing: 2 }),
        shape({ x: 90, y: 1600, w: 900, h: 130, fill: "#0f3d3e", cornerRadius: 65 }),
        text({ x: 90, y: 1638, w: 900, text: "Save your seat →", fontFamily: "Montserrat", fontSize: 46, fontWeight: 700, fill: "#f4f1ea", align: "center" }),
      ],
    },
  },
  {
    id: "quote",
    name: "tpl.quote",
    design: {
      width: 1080,
      height: 1350,
      background: "#111111",
      elements: [
        text({ x: 90, y: 160, w: 300, text: "“", fontFamily: "DM Serif Display", fontSize: 320, fill: "#e8c547", lineHeight: 1 }),
        text({ x: 90, y: 470, w: 900, text: "Say one thing, and say it well.", fontFamily: "DM Serif Display", fontSize: 104, fill: "#ffffff", lineHeight: 1.12 }),
        shape({ shape: "line", x: 90, y: 1000, w: 160, h: 12, stroke: "#e8c547", strokeWidth: 6 }),
        text({ x: 90, y: 1050, w: 900, text: "YOUR NAME", fontFamily: "Inter", fontSize: 34, fontWeight: 600, fill: "#bdbdbd", letterSpacing: 8 }),
      ],
    },
  },
];

export const TEXT_PRESETS: { id: "heading" | "subheading" | "body"; el: Raw }[] = [
  { id: "heading", el: text({ w: 800, text: "Add a heading", fontFamily: "Poppins", fontSize: 96, fontWeight: 800, fill: "#111111" }) },
  { id: "subheading", el: text({ w: 700, text: "Add a subheading", fontFamily: "Poppins", fontSize: 56, fontWeight: 600, fill: "#111111" }) },
  { id: "body", el: text({ w: 600, text: "Add a little bit of body text", fontSize: 32, fill: "#333333", lineHeight: 1.4 }) },
];

export const SHAPE_PRESETS: { id: string; el: Raw }[] = [
  { id: "rect", el: shape({ w: 400, h: 300, fill: "#7c5cff" }) },
  { id: "rounded", el: shape({ w: 400, h: 300, fill: "#22d3c5", cornerRadius: 48 }) },
  { id: "ellipse", el: shape({ shape: "ellipse", w: 360, h: 360, fill: "#ff3d9a" }) },
  { id: "triangle", el: shape({ shape: "triangle", w: 380, h: 330, fill: "#ffb020" }) },
  { id: "star", el: shape({ shape: "star", w: 380, h: 380, fill: "#ffd23f" }) },
  { id: "line", el: shape({ shape: "line", w: 500, h: 20, stroke: "#111111", strokeWidth: 8 }) },
  { id: "gradient", el: shape({ w: 400, h: 300, fill: { kind: "linear", angle: 135, colors: ["#7c5cff", "#22d3c5"] }, cornerRadius: 24 }) },
];

/** Places a preset centered on the page, scaled to the page size. */
export function placeOnPage(raw: Raw, page: { width: number; height: number }): Raw {
  const k = Math.min(page.width, page.height) / 1080;
  const out: Raw = { ...raw };
  for (const f of ["w", "h", "fontSize", "strokeWidth", "cornerRadius"]) if (typeof out[f] === "number") out[f] = (out[f] as number) * k;
  out.x = (page.width - (out.w as number)) / 2;
  out.y = (page.height - ((out.h as number) ?? 0)) / 2;
  return out;
}
