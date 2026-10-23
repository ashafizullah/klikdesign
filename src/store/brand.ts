// Brand kit of a workspace: colors, fonts, logos and a note on voice. Stored in
// the app's data (not the project folder) and shared by every design linked to
// that workspace; the AI uses it instead of researching the brand each time.
import { create } from "zustand";
import { ipc } from "../lib/ipc";

export interface BrandKit {
  colors: string[];
  fonts: string[];
  /** Stored copies of the logos (absolute paths in the app's data). */
  logos: string[];
  /** Tone, tagline or other guidance, in the user's words. */
  voice: string;
}

export const EMPTY_BRAND: BrandKit = { colors: [], fonts: [], logos: [], voice: "" };

const LIMITS = { colors: 16, fonts: 6, logos: 12, voice: 2000 };

const strings = (v: unknown, max: number, clean = (x: string) => x) =>
  [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((x) => clean(x.trim())).filter(Boolean))].slice(0, max);

/** Hex colors are compared and stored in lower case. */
const hexLower = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c.toLowerCase() : c);

/** Cleans a kit read from disk or written by the AI. */
export function normalizeBrand(raw: unknown): BrandKit {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    colors: strings(r.colors, LIMITS.colors, hexLower),
    fonts: strings(r.fonts, LIMITS.fonts),
    logos: strings(r.logos, LIMITS.logos),
    voice: typeof r.voice === "string" ? r.voice.trim().slice(0, LIMITS.voice) : "",
  };
}

export const isEmptyBrand = (k: BrandKit) => !k.colors.length && !k.fonts.length && !k.logos.length && !k.voice;

interface BrandState {
  kits: Record<string, BrandKit>;
}

export const useBrand = create<BrandState>()(() => ({ kits: {} }));

const loading = new Map<string, Promise<BrandKit>>();

/** The workspace's kit, read once per session. */
export function loadBrand(workspaceId: string): Promise<BrandKit> {
  const cached = useBrand.getState().kits[workspaceId];
  if (cached) return Promise.resolve(cached);
  let p = loading.get(workspaceId);
  if (!p) {
    p = ipc
      .brandGet(workspaceId)
      .then((json) => {
        const kit = json ? normalizeBrand(JSON.parse(json)) : EMPTY_BRAND;
        useBrand.setState((s) => ({ kits: { ...s.kits, [workspaceId]: kit } }));
        return kit;
      })
      .finally(() => loading.delete(workspaceId));
    loading.set(workspaceId, p);
  }
  return p;
}

export async function saveBrand(workspaceId: string, kit: BrandKit): Promise<BrandKit> {
  const clean = normalizeBrand(kit);
  await ipc.brandSet(workspaceId, JSON.stringify(clean));
  useBrand.setState((s) => ({ kits: { ...s.kits, [workspaceId]: clean } }));
  return clean;
}

/** Applies `fn` to the current kit and saves it. */
export async function updateBrand(workspaceId: string, fn: (k: BrandKit) => BrandKit): Promise<BrandKit> {
  return saveBrand(workspaceId, fn(await loadBrand(workspaceId)));
}

/** Kit of the given workspace if it is loaded (empty otherwise); for render and sync code. */
export const brandOf = (workspaceId: string | null | undefined): BrandKit =>
  (workspaceId && useBrand.getState().kits[workspaceId]) || EMPTY_BRAND;

export function useBrandKit(workspaceId: string | null | undefined): BrandKit {
  const kit = useBrand((s) => (workspaceId ? s.kits[workspaceId] : undefined));
  if (workspaceId && !kit) void loadBrand(workspaceId).catch(() => {});
  return kit ?? EMPTY_BRAND;
}
