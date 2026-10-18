// Curated Google Fonts, loaded on demand. Canvas text is measured when it is
// drawn, so text redraws once a font finishes loading (see `useFonts`).
import { create } from "zustand";

export interface FontInfo {
  family: string;
  category: "sans" | "serif" | "display" | "script";
  weights: number[];
  italic?: boolean;
}

export const FONTS: FontInfo[] = [
  { family: "Inter", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Poppins", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Montserrat", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Plus Jakarta Sans", category: "sans", weights: [300, 400, 500, 600, 700, 800], italic: true },
  { family: "Space Grotesk", category: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "DM Sans", category: "sans", weights: [400, 500, 700], italic: true },
  { family: "Raleway", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Oswald", category: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Bebas Neue", category: "display", weights: [400] },
  { family: "Anton", category: "display", weights: [400] },
  { family: "Archivo Black", category: "display", weights: [400] },
  { family: "Righteous", category: "display", weights: [400] },
  { family: "Abril Fatface", category: "display", weights: [400] },
  { family: "Playfair Display", category: "serif", weights: [400, 500, 600, 700, 800, 900], italic: true },
  { family: "DM Serif Display", category: "serif", weights: [400], italic: true },
  { family: "Lora", category: "serif", weights: [400, 500, 600, 700], italic: true },
  { family: "Merriweather", category: "serif", weights: [300, 400, 700, 900], italic: true },
  { family: "Pacifico", category: "script", weights: [400] },
  { family: "Dancing Script", category: "script", weights: [400, 500, 600, 700] },
  { family: "Lobster", category: "script", weights: [400] },
];

export const fontInfo = (family: string) => FONTS.find((f) => f.family === family);

/** Closest weight the family actually ships. */
export function nearestWeight(family: string, weight: number): number {
  const ws = fontInfo(family)?.weights ?? [400, 700];
  return ws.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
}

export function cssUrl(f: FontInfo): string {
  const fam = f.family.replace(/ /g, "+");
  const spec = f.italic
    ? `ital,wght@${[0, 1].flatMap((i) => f.weights.map((w) => `${i},${w}`)).join(";")}`
    : `wght@${f.weights.join(";")}`;
  return `https://fonts.googleapis.com/css2?family=${fam}:${spec}&display=block`;
}

/** Bumps whenever a font finishes loading so canvas text re-measures. */
export const useFonts = create<{ version: number }>()(() => ({ version: 0 }));

const loading = new Map<string, Promise<void>>();

export function ensureFont(family: string): Promise<void> {
  const info = fontInfo(family);
  if (!info) return Promise.resolve();
  let p = loading.get(family);
  if (!p) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl(info);
    document.head.appendChild(link);
    p = new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
    })
      .then(() => Promise.all(info.weights.map((w) => document.fonts.load(`${w} 32px "${family}"`).catch(() => []))))
      .then(() => useFonts.setState((s) => ({ version: s.version + 1 })));
    loading.set(family, p);
  }
  return p;
}

export const ensureFonts = (families: Iterable<string>) => Promise.all([...new Set(families)].map(ensureFont));
