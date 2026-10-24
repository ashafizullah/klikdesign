// Lucide icons (ISC license; some derived from Feather, MIT; see
// THIRD_PARTY_NOTICES.md) as path data. The set is ~2,000 icons, so it is
// loaded on first use instead of with the app.
import { create } from "zustand";

/** Lucide's format: the SVG children of a 24×24 icon. */
export type IconNode = [string, Record<string, string | number>][];

type Library = Record<string, IconNode>;

/** Bumps when the library has loaded, so icons render. */
export const useIcons = create<{ lib: Library | null }>()(() => ({ lib: null }));

let loading: Promise<Library> | null = null;

/** The icon library keyed by Lucide name ("map-pin"). */
export function loadIcons(): Promise<Library> {
  loading ??= import("lucide").then(({ icons }) => {
    const lib: Library = {};
    for (const [pascal, node] of Object.entries(icons as unknown as Record<string, IconNode>)) lib[kebab(pascal)] = node;
    useIcons.setState({ lib });
    return lib;
  });
  return loading;
}

/** "MapPin" → "map-pin", "Grid2x2" → "grid-2x2" (close to Lucide's own names; used as our stable ids). */
export const kebab = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/(?<!\d)([A-Za-z])(\d)/g, "$1-$2")
    .toLowerCase();

const n = (v: unknown) => Number(v) || 0;

/** SVG path data of one icon child (circles, rects, lines… as paths). */
export function toPath([tag, a]: IconNode[number]): string {
  switch (tag) {
    case "path":
      return String(a.d ?? "");
    case "circle":
    case "ellipse": {
      const rx = n(tag === "circle" ? a.r : a.rx);
      const ry = n(tag === "circle" ? a.r : a.ry);
      const [cx, cy] = [n(a.cx), n(a.cy)];
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
    }
    case "rect": {
      const [x, y, w, h] = [n(a.x), n(a.y), n(a.width), n(a.height)];
      const r = Math.min(n(a.rx ?? a.ry), w / 2, h / 2);
      if (!r) return `M${x} ${y}h${w}v${h}h${-w}z`;
      return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
    }
    case "line":
      return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
    case "polyline":
    case "polygon": {
      const pts = String(a.points ?? "").trim().split(/[\s,]+/).map(Number);
      let d = "";
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? "L" : "M"}${pts[i]} ${pts[i + 1]}`;
      return tag === "polygon" ? `${d}z` : d;
    }
    default:
      return "";
  }
}

/** Path data of an icon, or null when the name is unknown (or the library is not loaded yet). */
export function iconPaths(lib: Library | null, name: string): string[] | null {
  const node = lib?.[name];
  return node ? node.map(toPath).filter(Boolean) : null;
}

/** Icon names matching `query` (words in any order), best matches first. */
export function searchIcons(lib: Library, query: string, limit = 120): string[] {
  const words = query.toLowerCase().trim().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return POPULAR.filter((x) => lib[x]).slice(0, limit);
  const hits: [string, number][] = [];
  for (const name of Object.keys(lib)) {
    if (!words.every((w) => name.includes(w))) continue;
    const parts = name.split("-");
    const score = (name === words.join("-") ? 0 : parts[0] === words[0] ? 1 : parts.includes(words[0]) ? 2 : 3) * 100 + name.length;
    hits.push([name, score]);
  }
  return hits.sort((a, b) => a[1] - b[1]).slice(0, limit).map(([x]) => x);
}

/**
 * Shown before searching: icons posters often need. Lucide has no brand logos
 * (Instagram, WhatsApp…): those come from the brands' own asset kits.
 */
export const POPULAR = [
  "phone", "mail", "map-pin", "calendar", "clock", "globe", "at-sign", "link", "share-2", "send", "hash", "message-circle",
  "shopping-bag", "shopping-cart", "tag", "percent", "gift", "ticket", "truck", "credit-card", "wallet", "store",
  "star", "heart", "thumbs-up", "check", "check-circle", "x", "plus", "arrow-right", "arrow-up-right", "chevron-right",
  "sparkles", "zap", "flame", "award", "trophy", "crown", "rocket", "target", "lightbulb", "bell",
  "coffee", "utensils", "pizza", "cake", "music", "camera", "image", "video", "mic", "headphones",
  "users", "user", "graduation-cap", "book-open", "briefcase", "building", "home", "car", "plane", "wifi",
  "leaf", "sun", "moon", "cloud", "droplet", "smile", "party-popper", "megaphone", "badge-percent", "qr-code",
];
