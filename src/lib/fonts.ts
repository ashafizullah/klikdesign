// Curated Google Fonts, loaded on demand, plus the fonts installed on this
// computer. Canvas text is measured when it is drawn, so text redraws once a
// font finishes loading (see `useFonts`).
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface FontInfo {
  family: string;
  category: "sans" | "serif" | "display" | "script" | "system";
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

/** A curated Google Font (these embed in SVG exports and are offered to the AI). */
export const googleFont = (family: string) => FONTS.find((f) => f.family === family);

/** Google Font or installed font with this family name. */
export const fontInfo = (family: string) => googleFont(family) ?? useFonts.getState().system.find((f) => f.family === family);

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

interface FontsState {
  /** Bumps whenever a font finishes loading so canvas text re-measures. */
  version: number;
  /** Fonts installed on this computer (empty until `loadSystemFonts`). */
  system: FontInfo[];
}

export const useFonts = create<FontsState>()(() => ({ version: 0, system: [] }));

let systemLoad: Promise<void> | undefined;

/** Lists the installed fonts once per session. */
export function loadSystemFonts(): Promise<void> {
  systemLoad ??= invoke<{ family: string; weights: number[]; italic: boolean }[]>("system_fonts")
    .then((list) => {
      const google = new Set(FONTS.map((f) => f.family));
      const system = list.filter((f) => !google.has(f.family)).map((f) => ({ ...f, category: "system" as const, weights: f.weights.length ? f.weights : [400] }));
      useFonts.setState({ system });
    })
    .catch(() => {
      systemLoad = undefined;
    });
  return systemLoad;
}

const bump = () => useFonts.setState((s) => ({ version: s.version + 1 }));

const loading = new Map<string, Promise<void>>();

export function ensureFont(family: string): Promise<void> {
  const info = googleFont(family);
  let p = loading.get(family);
  if (!p && !info) {
    // Installed fonts need no download; wait for the webview to load the face, then re-measure.
    p = document.fonts.load(`32px "${family}"`).catch(() => []).then(bump);
    loading.set(family, p);
  }
  if (!p && info) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl(info);
    document.head.appendChild(link);
    p = new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
    })
      .then(() => Promise.all(info.weights.map((w) => document.fonts.load(`${w} 32px "${family}"`).catch(() => []))))
      .then(bump);
    loading.set(family, p);
  }
  return p ?? Promise.resolve();
}

export const ensureFonts = (families: Iterable<string>) => Promise.all([...new Set(families)].map(ensureFont));
