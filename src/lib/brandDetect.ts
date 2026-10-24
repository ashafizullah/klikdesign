// Fills a workspace's brand kit with the app's AI: it reads the project
// (theme files, CSS, README, logos) and saves the colors, fonts, logo and voice
// it finds. Nothing is written to the project folder.
import { activeVision, aiReady } from "../store/settings";
import { loadBrand, normalizeBrand, updateBrand, type BrandKit } from "../store/brand";
import { t } from "../i18n";
import { FONTS, fontInfo, loadSystemFonts, useFonts } from "./fonts";
import { jpegBase64, loadWorkspaceImage } from "./images";
import { ipc, type ToolDef } from "./ipc";
import { runToolLoop, WithImage, type ToolArgs } from "./toolLoop";

const str = { type: "string" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

function tools(vision: boolean): ToolDef[] {
  return [
    { name: "list_files", description: "Lists files and folders (folders end with /) in the project folder.", parameters: obj({ dir: { ...str, description: "Folder relative to the project root; empty for the root" }, depth: { type: "number" } }) },
    { name: "read_file", description: "Reads a text file from the project folder.", parameters: obj({ path: str }, ["path"]) },
    { name: "search_code", description: "Case-insensitive text search across the project. Returns path:line: text.", parameters: obj({ query: str }, ["query"]) },
    { name: "list_project_images", description: "Lists image files in the project, likely brand assets (logo, icon) first.", parameters: obj({}) },
    ...(vision ? [{ name: "view_project_image", description: "Shows you an image from the project folder.", parameters: obj({ path: str }, ["path"]) }] : []),
    { name: "list_installed_fonts", description: "Lists font families installed on this computer.", parameters: obj({ query: str }) },
    {
      name: "save_brand_kit",
      description: "Saves what you found. Fonts must be available (see the system prompt); unavailable ones are reported back so you can pick the closest available family.",
      parameters: obj({
        colors: { type: "array", items: str, description: "Hex colors, most important first (primary, secondary, accent, dark, light)" },
        fonts: { type: "array", items: str, description: "Font families: heading first, then body" },
        logos_from_project: { type: "array", items: str, description: "Logo image paths relative to the project root (the main logo first)" },
        voice: { ...str, description: "One or two sentences on tone, plus the tagline if there is one, in the product's language" },
      }),
    },
  ];
}

function system(overview: string, vision: boolean): string {
  const fonts = FONTS.map((f) => f.family).join(", ");
  return `You extract a product's brand kit from its source code for KlikDesign, a poster editor. Read-only research with list_files, read_file and search_code, then call save_brand_kit once.

Look for:
- colors: Tailwind config (theme.extend.colors), CSS variables (--primary, --brand…), theme files, the web manifest (theme_color); prefer the brand palette over generic greys. Hex only, at most 8.
- fonts: font families in Tailwind config, CSS @font-face / font-family, next/font or fontsource imports. Available families are these Google Fonts: ${fonts}, plus fonts installed on this computer (list_installed_fonts). If the product uses another font, pick the closest available one.
- logos: list_project_images${vision ? ", check candidates with view_project_image" : ""}; choose the real logo or app icon (SVG or PNG), not screenshots or illustrations. At most 2.
- voice: the tone of the product's own copy (README, landing page, i18n) and its tagline.

Keep it short (about 10 calls). Do not invent values you did not find; leave a field out instead.

${overview}`;
}

export interface DetectProgress {
  onTool?(name: string): void;
  signal?: { cancelled: boolean };
}

/** Runs the AI on the workspace and merges what it finds into the kit (existing entries stay first). */
export async function detectBrand(workspaceId: string, p: DetectProgress = {}): Promise<BrandKit> {
  if (!(await aiReady())) throw new Error(t("err.noAiKey"));
  await Promise.all([loadSystemFonts(), loadBrand(workspaceId)]);
  const vision = activeVision();
  const overview = await ipc.wsOverview(workspaceId);
  let saved: BrandKit | null = null;

  const exec = async (name: string, a: ToolArgs): Promise<unknown> => {
    switch (name) {
      case "list_files":
        return (await ipc.wsListFiles(workspaceId, String(a.dir ?? ""), typeof a.depth === "number" ? a.depth : 2)).join("\n");
      case "read_file":
        return ipc.wsReadFile(workspaceId, String(a.path));
      case "search_code": {
        const hits = await ipc.wsSearch(workspaceId, String(a.query));
        return hits.length ? hits.join("\n") : "no matches";
      }
      case "list_project_images": {
        const imgs = await ipc.wsImages(workspaceId);
        return imgs.length ? imgs.join("\n") : "no images in the project";
      }
      case "view_project_image": {
        const img = await loadWorkspaceImage(workspaceId, String(a.path));
        return new WithImage(`${String(a.path)} (${img.naturalWidth}×${img.naturalHeight})`, { mediaType: "image/jpeg", data: jpegBase64(img) });
      }
      case "list_installed_fonts": {
        const q = typeof a.query === "string" ? a.query.trim().toLowerCase() : "";
        const list = useFonts.getState().system.filter((f) => !q || f.family.toLowerCase().includes(q));
        return list.length ? list.slice(0, 300).map((f) => f.family).join("\n") : "no match";
      }
      case "save_brand_kit": {
        const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
        const fonts = list(a.fonts);
        const missing = fonts.filter((f) => !fontInfo(f));
        if (missing.length) return `Not available: ${missing.join(", ")}. Pick the closest available family for each and call save_brand_kit again.`;
        const logos: string[] = [];
        for (const rel of list(a.logos_from_project).slice(0, 2)) logos.push(await ipc.brandLogoImport(workspaceId, { rel }));
        saved = await updateBrand(workspaceId, (k) =>
          normalizeBrand({
            colors: [...k.colors, ...list(a.colors)],
            fonts: [...k.fonts, ...fonts],
            logos: [...k.logos, ...logos],
            voice: k.voice || (typeof a.voice === "string" ? a.voice : ""),
          }),
        );
        return saved;
      }
      default:
        throw new Error(`unknown tool: ${name}`);
    }
  };

  await runToolLoop({
    system: system(overview, vision),
    history: [{ role: "user", content: [{ type: "text", text: "Find this product's brand kit and save it." }] }],
    tools: tools(vision),
    exec,
    maxSteps: 16,
    signal: p.signal,
    done: () => saved !== null,
    onTool: (name) => p.onTool?.(name),
  });
  if (p.signal?.cancelled) throw new Error(t("brand.detectCancelled"));
  if (!saved) throw new Error(t("brand.detectNothing"));
  return saved;
}
