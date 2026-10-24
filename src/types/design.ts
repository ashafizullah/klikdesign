// The design document: one page with absolutely positioned elements.
// Coordinates are page pixels; every element rotates around its top-left corner.

export interface LinearGradient {
  kind: "linear";
  /** Degrees, 0 = left → right, 90 = top → bottom. */
  angle: number;
  colors: string[];
}
export type Fill = string | LinearGradient;

export interface Shadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

interface Base {
  id: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  /** Ignored for text: its height follows the wrapped content. */
  h: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
  hidden?: boolean;
  shadow?: Shadow | null;
  /** Elements sharing a group id select, move and arrange as one. */
  groupId?: string;
  /** The group's name, kept on each of its members. */
  groupName?: string;
}

export interface TextEl extends Base {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic?: boolean;
  fill: Fill;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  uppercase?: boolean;
  stroke?: string;
  strokeWidth?: number;
}

export type ShapeKind = "rect" | "ellipse" | "triangle" | "star" | "line";

export interface ShapeEl extends Base {
  type: "shape";
  shape: ShapeKind;
  fill: Fill;
  stroke?: string;
  strokeWidth?: number;
  /** Rect corner radius in px. */
  cornerRadius?: number;
}

/** How an image fills its box: it always covers it, `zoom` times closer, with the visible part at `x`/`y` (0…1, 0.5 = centered). */
export interface Crop {
  x: number;
  y: number;
  zoom: number;
}

/** Shapes a photo can be framed in (cut to). */
export const MASKS = ["circle", "arch", "triangle", "star", "hexagon", "heart", "blob"] as const;
export type Mask = (typeof MASKS)[number];

/** Photo adjustments, each -100…100 (0 = unchanged; saturation -100 = black and white). */
export interface Adjust {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface ImageEl extends Base {
  type: "image";
  /** Path of the image inside the design's media folder. */
  src: string;
  cornerRadius?: number;
  crop?: Crop;
  /** Frame shape the photo is cut to. */
  mask?: Mask;
  adjust?: Adjust;
  /** A color laid over the photo, e.g. to keep text on it readable. */
  overlay?: { color: string; opacity: number };
}

/** A Lucide icon, drawn as strokes in its 24×24 grid scaled to the box. */
export interface IconEl extends Base {
  type: "icon";
  /** Lucide name, e.g. "map-pin". */
  icon: string;
  color: string;
  /** Stroke width in the icon's 24-unit grid (Lucide's default is 2). */
  strokeWidth: number;
}

/** A QR code for `data` (a link, a WhatsApp chat link, text); always square. */
export interface QrEl extends Base {
  type: "qr";
  data: string;
  color: string;
  /** Behind the code, including its quiet zone; "transparent" for none. */
  background: string;
}

export type El = TextEl | ShapeEl | ImageEl | IconEl | QrEl;
export type ElType = El["type"];
/** An element before it gets an id. */
export type NewEl = El extends infer T ? (T extends El ? Omit<T, "id"> : never) : never;

/** One page of a multi-page design (carousel). */
export interface Page {
  id: string;
  background: Fill;
  elements: El[];
}

/**
 * The open page's content is `background` and `elements`, so everything that
 * edits a page works on it directly; the other pages wait in `pages`, in order
 * without the open one, which sits at index `page` (see lib/pages).
 */
export interface Design {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  background: Fill;
  elements: El[];
  /** Linked project folder the AI researches (brand, copy, logo). */
  workspaceId?: string | null;
  /** Id of the open page. */
  pageId?: string;
  /** Index of the open page among all pages (0 when there is one). */
  page?: number;
  /** The other pages, in order; absent for a single page. */
  pages?: Page[];
}

export interface SizePreset {
  id: string;
  width: number;
  height: number;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: "igPost", width: 1080, height: 1350 },
  { id: "igSquare", width: 1080, height: 1080 },
  { id: "story", width: 1080, height: 1920 },
  { id: "a4", width: 2480, height: 3508 },
  { id: "a4Landscape", width: 3508, height: 2480 },
  { id: "poster", width: 1800, height: 2400 },
  { id: "banner", width: 1920, height: 1080 },
];

export const isGradient = (f: Fill | undefined): f is LinearGradient => typeof f === "object" && f !== null && f.kind === "linear";

/** First solid color of a fill, for swatches and color inputs. */
export const solidOf = (f: Fill | undefined, fallback = "#000000"): string =>
  isGradient(f) ? (f.colors[0] ?? fallback) : (f || fallback);

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function color(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const c = v.trim();
  return HEX.test(c) || /^(rgba?|hsla?)\(/i.test(c) || c === "transparent" ? c : fallback;
}

export function normalizeFill(v: unknown, fallback: string): Fill {
  if (v && typeof v === "object" && Array.isArray((v as LinearGradient).colors)) {
    const g = v as LinearGradient;
    const colors = g.colors.map((c) => color(c, "")).filter(Boolean);
    if (colors.length >= 2) return { kind: "linear", angle: num(g.angle, 90), colors: colors.slice(0, 5) };
    if (colors.length === 1) return colors[0];
  }
  return color(v, fallback);
}

function normalizeShadow(v: unknown): Shadow | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Partial<Shadow>;
  return { color: color(s.color, "rgba(0,0,0,0.35)"), blur: clamp(num(s.blur, 12), 0, 200), offsetX: num(s.offsetX, 0), offsetY: num(s.offsetY, 4) };
}

function normalizeAdjust(v: unknown): Adjust | undefined {
  if (!v || typeof v !== "object") return undefined;
  const a = v as Partial<Adjust>;
  const adjust = { brightness: clamp(num(a.brightness, 0), -100, 100), contrast: clamp(num(a.contrast, 0), -100, 100), saturation: clamp(num(a.saturation, 0), -100, 100) };
  return adjust.brightness || adjust.contrast || adjust.saturation ? adjust : undefined;
}

function normalizeOverlay(v: unknown): ImageEl["overlay"] {
  if (!v || typeof v !== "object") return undefined;
  const o = v as { color?: unknown; opacity?: unknown };
  const opacity = clamp(num(o.opacity, 0.4), 0, 1);
  return opacity > 0 ? { color: color(o.color, "#000000"), opacity } : undefined;
}

function normalizeCrop(v: unknown): Crop | undefined {
  if (!v || typeof v !== "object") return undefined;
  const c = v as Partial<Crop>;
  const crop = { x: clamp(num(c.x, 0.5), 0, 1), y: clamp(num(c.y, 0.5), 0, 1), zoom: clamp(num(c.zoom, 1), 1, 10) };
  return crop.x === 0.5 && crop.y === 0.5 && crop.zoom === 1 ? undefined : crop;
}

/**
 * Fills defaults and drops invalid values. Used for stored designs, templates
 * and everything the AI writes, so the canvas never sees a malformed element.
 */
export function normalizeElement(raw: Record<string, unknown>, id: string): El | null {
  const base = {
    id,
    name: typeof raw.name === "string" ? raw.name.slice(0, 60) : undefined,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: Math.max(1, num(raw.w, 200)),
    h: Math.max(1, num(raw.h, 200)),
    rotation: num(raw.rotation, 0),
    opacity: clamp(num(raw.opacity, 1), 0, 1),
    locked: raw.locked === true || undefined,
    hidden: raw.hidden === true || undefined,
    shadow: normalizeShadow(raw.shadow),
    groupId: typeof raw.groupId === "string" && raw.groupId ? raw.groupId : undefined,
    groupName: typeof raw.groupId === "string" && raw.groupId && typeof raw.groupName === "string" && raw.groupName.trim() ? raw.groupName.trim().slice(0, 60) : undefined,
  };
  switch (raw.type) {
    case "text":
      return {
        ...base,
        type: "text",
        text: str(raw.text, "Text"),
        fontFamily: str(raw.fontFamily, "Inter"),
        fontSize: clamp(num(raw.fontSize, 48), 4, 2000),
        fontWeight: clamp(Math.round(num(raw.fontWeight, 400) / 100) * 100, 100, 900),
        italic: raw.italic === true || undefined,
        fill: normalizeFill(raw.fill, "#111111"),
        align: raw.align === "center" || raw.align === "right" ? raw.align : "left",
        lineHeight: clamp(num(raw.lineHeight, 1.2), 0.5, 4),
        letterSpacing: clamp(num(raw.letterSpacing, 0), -50, 200),
        uppercase: raw.uppercase === true || undefined,
        stroke: raw.stroke ? color(raw.stroke, "#000000") : undefined,
        strokeWidth: raw.stroke ? clamp(num(raw.strokeWidth, 2), 0, 100) : undefined,
      };
    case "shape": {
      const shapes: ShapeKind[] = ["rect", "ellipse", "triangle", "star", "line"];
      const shape = shapes.includes(raw.shape as ShapeKind) ? (raw.shape as ShapeKind) : "rect";
      return {
        ...base,
        type: "shape",
        shape,
        fill: normalizeFill(raw.fill, shape === "line" ? "transparent" : "#22d3c5"),
        stroke: raw.stroke ? color(raw.stroke, "#000000") : shape === "line" ? "#111111" : undefined,
        strokeWidth: raw.stroke || shape === "line" ? clamp(num(raw.strokeWidth, 4), 0, 200) : undefined,
        cornerRadius: shape === "rect" ? clamp(num(raw.cornerRadius, 0), 0, 2000) : undefined,
      };
    }
    case "image":
      if (typeof raw.src !== "string" || !raw.src) return null;
      return {
        ...base,
        type: "image",
        src: raw.src,
        cornerRadius: clamp(num(raw.cornerRadius, 0), 0, 2000) || undefined,
        crop: normalizeCrop(raw.crop),
        mask: MASKS.includes(raw.mask as Mask) ? (raw.mask as Mask) : undefined,
        adjust: normalizeAdjust(raw.adjust),
        overlay: normalizeOverlay(raw.overlay),
      };
    case "icon":
      if (typeof raw.icon !== "string" || !/^[a-z0-9-]{1,60}$/.test(raw.icon)) return null;
      return { ...base, type: "icon", icon: raw.icon, color: color(raw.color, "#111111"), strokeWidth: clamp(num(raw.strokeWidth, 2), 0.5, 6) };
    case "qr": {
      if (typeof raw.data !== "string" || !raw.data.trim()) return null;
      const size = Math.max(base.w, 24);
      return { ...base, w: size, h: size, type: "qr", data: raw.data.slice(0, 1200), color: color(raw.color, "#111111"), background: color(raw.background, "#ffffff") };
    }
    default:
      return null;
  }
}
