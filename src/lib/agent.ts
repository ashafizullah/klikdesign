// Design agent: builds a poster from a prompt and revises it by chat, through
// element-level tools on the open design.
import type { El } from "../types/design";
import { SIZE_PRESETS, normalizeElement, normalizeFill } from "../types/design";
import { asOneStep, useDesign, type Reorder } from "../store/design";
import { activeVision } from "../store/settings";
import type { Message, ToolDef } from "./ipc";
import { FONTS, ensureFonts, fontInfo, loadSystemFonts, nearestWeight, useFonts } from "./fonts";
import { mediaChanged } from "./media";
import { resizeLayout } from "./resize";
import { pageCount } from "./pages";
import { useUi } from "../store/ui";
import { brandOf, isEmptyBrand, loadBrand, normalizeBrand, updateBrand } from "../store/brand";
import { renderPage, textLines } from "./stage";
import { ipc } from "./ipc";
import { linkedWorkspace } from "./workspace";
import { jpegBase64, loadImage, loadWorkspaceImage } from "./images";
import { LOCALES, translate } from "../i18n";
import { textHeight } from "./geometry";
import { runToolLoop, WithImage, type ToolArgs } from "./toolLoop";

/** Design rules and reference for a model that edits the page through `tools()`. */
export async function designGuide(): Promise<string> {
  const ws = linkedWorkspace(useDesign.getState().design.workspaceId);
  if (ws) await loadBrand(ws.id).catch(() => {});
  const linked = !!ws;
  return system(true, null) +
    (linked
      ? "\n\nA project folder is linked to this design: find its logo and screenshots with list_project_images, look at them with view_project_image and place them with place_project_image."
      : "");
}

/** The design still has the default name in some language, so the AI may title it. */
export const isUntitled = (name: string) => !name.trim() || LOCALES.some((l) => translate(l.id, "home.untitled") === name);

function system(vision: boolean, project: string | null): string {
  const { width, height, name } = useDesign.getState().design;
  const fonts = FONTS.map((f) => `${f.family} (${f.category}; weights ${f.weights.join("/")})`).join("\n- ");
  return `You are a senior graphic designer working inside KlikDesign, a Canva-like poster editor. You design and revise the open page only through tools.

The page is ${width}×${height} px. Coordinates are page pixels from the top-left corner; every element has x, y (its top-left corner), w, h and rotation in degrees around that corner. Elements are drawn bottom to top in list order.

Element types:
- text: text, fontFamily, fontSize (px), fontWeight (100–900), italic, fill, align (left|center|right), lineHeight (multiplier), letterSpacing (px), uppercase, stroke, strokeWidth. Text wraps inside w; its height follows the content (get_design reports the measured h).
- shape: shape (rect|ellipse|triangle|star|line), fill, stroke, strokeWidth, cornerRadius (rect only). A line is drawn horizontally through the middle of its box using stroke/strokeWidth.
- image: pictures. You cannot generate images, but you may move, resize, layer or round them (cornerRadius)${project ? ", and place images from the project folder with place_project_image" : ""}.
Any element also takes opacity (0–1), name, and shadow {color, blur, offsetX, offsetY}.
A design can have several pages (a carousel or slide set); the tools act on the open page (get_design says which). For a carousel, finish page 1, then add_page for each next slide (copy_current: true to keep the layout and change the copy), keeping one visual system across slides.
A fill is a CSS color ("#0f172a", "rgba(0,0,0,0.5)") or a linear gradient {"kind":"linear","angle":deg,"colors":["#…","#…"]} (0° = left→right, 90° = top→bottom).

Available fonts (use these):
- ${fonts}
Fonts installed on this computer are also allowed, but only when the user asks for one or it is the brand font (list_installed_fonts).

How to work:
1. Call get_design first; never invent element ids.
2. For a new poster, call clear_design, set_canvas for the background, then add_elements in a few batches (background shapes first, then text). Keep text in separate elements per role (headline, subheading, body, call to action, details).
3. Design like a professional: a clear hierarchy (one dominant headline, large and bold), generous margins (at least 6% of the page width), aligned edges, consistent spacing, at most two font families, a limited palette of 2–4 colors with strong contrast for text. Decorative shapes should support the layout, not clutter it. Keep every element inside the page unless it is a deliberate bleed.
4. Write copy in the user's language. Use real, specific wording from the brief; invent plausible details (date, place, price) only when the user did not give them and the poster needs them.
5. To revise, change only what the user asked for, with update_elements; keep the rest.${vision ? "\n6. After building or a larger change, call view_design to look at the result and fix overlaps, cut-off text, poor contrast or awkward spacing." : ""}
${brandSection()}${isUntitled(name) ? "The design has no title yet: once you know what it is about, call rename_design with a short title (2–5 words) in the user's language.\n" : ""}Finish with one or two sentences, in the user's language, summarising what you made or changed.${project ? projectSection(project, vision) : ""}`;
}

/** The linked workspace's brand kit, as rules for the model (empty when there is none). */
function brandSection(): string {
  const kit = brandOf(useDesign.getState().design.workspaceId);
  if (isEmptyBrand(kit)) return "";
  const lines = [
    kit.colors.length && `- colors: ${kit.colors.join(", ")} — build the palette from these (tints and black/white are fine)`,
    kit.fonts.length && `- fonts: ${kit.fonts.join(", ")} — use these for headings and body`,
    kit.logos.length && `- logos (place with place_brand_logo): ${kit.logos.join(", ")}`,
    kit.voice && `- voice and guidelines: ${kit.voice}`,
  ].filter(Boolean);
  return `\n## Brand kit\nThis design belongs to a brand with a saved kit. Follow it unless the user asks otherwise:\n${lines.join("\n")}\n\n`;
}

function projectSection(overview: string, vision: boolean): string {
  const kit = brandOf(useDesign.getState().design.workspaceId);
  const brandResearch = isEmptyBrand(kit)
    ? `- brand colors and fonts (Tailwind config, CSS variables, theme files) — base the palette on them;
- the logo and good screenshots: call list_project_images${vision ? ", look at candidates with view_project_image" : ""}, and place the logo (and a screenshot when it helps) with place_project_image.
The brand kit is still empty: once you know the brand, save it with update_brand_kit (colors, fonts, the logo's project path, a one-line voice) so later designs reuse it.`
    : `- the brand kit above already has the colors, fonts${kit.logos.length ? " and logo" : ""}; do not research them again. Use list_project_images only for screenshots or when the kit has no logo.`;
  return `

## Linked project folder
The poster is for the product in this folder. Before designing, research it with list_files, read_file and search_code (read-only):
- the product name, tagline, what it does and its key benefits, in the wording the product itself uses (README, landing page copy, i18n files);
${brandResearch}
Do not quote code, file paths, secrets or internal details on the poster. Keep the research short (a handful of calls), then design.

${overview}`;
}

const str = { type: "string" };
const num = { type: "number" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const fill = { description: 'CSS color or {"kind":"linear","angle":number,"colors":[string,…]}' };
const element = {
  type: "object",
  description: "An element; include type plus the fields for that type.",
  properties: {
    type: { type: "string", enum: ["text", "shape"] },
    name: str, x: num, y: num, w: num, h: num, rotation: num, opacity: num,
    text: str, fontFamily: str, fontSize: num, fontWeight: num, italic: { type: "boolean" }, align: { type: "string", enum: ["left", "center", "right"] },
    lineHeight: num, letterSpacing: num, uppercase: { type: "boolean" },
    shape: { type: "string", enum: ["rect", "ellipse", "triangle", "star", "line"] }, cornerRadius: num,
    fill, stroke: str, strokeWidth: num,
    shadow: obj({ color: str, blur: num, offsetX: num, offsetY: num }),
  },
  required: ["type", "x", "y", "w"],
};

export function tools(vision: boolean, project: boolean): ToolDef[] {
  const list: ToolDef[] = [
    { name: "get_design", description: "Returns the page size, background and every element (text heights are measured).", parameters: obj({}) },
    {
      name: "set_canvas",
      description: "Changes the page background and/or size. Only pass fields that change.",
      parameters: obj({ background: fill, width: num, height: num }),
    },
    { name: "clear_design", description: "Removes every element except user images, to start a fresh layout.", parameters: obj({}) },
    {
      name: "add_elements",
      description: "Adds elements on top of the stack, in order. Returns their ids.",
      parameters: obj({ elements: { type: "array", items: element } }, ["elements"]),
    },
    {
      name: "update_elements",
      description: "Changes fields of existing elements. Each update has the element id plus only the fields that change.",
      parameters: obj({ updates: { type: "array", items: { ...element, required: ["id"], properties: { id: str, ...element.properties } } } }, ["updates"]),
    },
    { name: "remove_elements", description: "Deletes elements by id.", parameters: obj({ ids: { type: "array", items: str } }, ["ids"]) },
    {
      name: "reorder",
      description: "Moves elements in the stack.",
      parameters: obj({ ids: { type: "array", items: str }, to: { type: "string", enum: ["front", "back", "forward", "backward"] } }, ["ids", "to"]),
    },
  ];
  list.push(
    { name: "rename_design", description: "Renames the open design (its title in the library).", parameters: obj({ name: str }, ["name"]) },
    {
      name: "add_page",
      description: "Adds a page after the open one and opens it (carousel slides). copy_current copies the open page to edit; otherwise it is blank with the same background.",
      parameters: obj({ copy_current: { type: "boolean" } }),
    },
    { name: "go_to_page", description: "Opens page n (1-based); the other tools then act on it.", parameters: obj({ page: num }, ["page"]) },
    { name: "remove_page", description: "Deletes page n (1-based). The last remaining page cannot be deleted.", parameters: obj({ page: num }, ["page"]) },
    {
      name: "resize_design",
      description: "Changes the page size and fits the layout to it: backgrounds stretch, other elements scale proportionally and keep their relative place. Then re-lay out for the new format with update_elements (get_design first). Give a size preset or width and height.",
      parameters: obj({
        size: { type: "string", enum: SIZE_PRESETS.map((p) => p.id), description: SIZE_PRESETS.map((p) => `${p.id} ${p.width}x${p.height}`).join(", ") },
        width: num, height: num,
      }),
    },
    { name: "list_design_images", description: "Lists the images stored with this design (uploaded or dropped by the user, or copied in earlier), newest first, with their pixel size.", parameters: obj({}) },
    {
      name: "place_design_image",
      description: "Places an image stored with this design (a path from list_design_images). Give w (and optionally h; by default the image keeps its aspect ratio). Returns the element id.",
      parameters: obj({ path: str, x: num, y: num, w: num, h: num, cornerRadius: num, name: str }, ["path", "x", "y", "w"]),
    },
    {
      name: "list_installed_fonts",
      description: "Lists font families installed on this computer, with weights. Use one only when the user asks for it or it is the brand font: they are not embedded in SVG exports and their licenses vary.",
      parameters: obj({ query: { ...str, description: "Optional case-insensitive filter on the family name" } }),
    },
  );
  if (vision) list.push(
    { name: "view_design", description: "Shows you a rendered image of the current page.", parameters: obj({}) },
    { name: "view_design_image", description: "Shows you an image stored with this design.", parameters: obj({ path: str }, ["path"]) },
  );
  if (project) {
    list.push(
      { name: "list_files", description: "Lists files and folders (folders end with /) in the project folder.", parameters: obj({ dir: { ...str, description: "Folder relative to the project root; empty for the root" }, depth: num }) },
      { name: "read_file", description: "Reads a text file from the project folder.", parameters: obj({ path: str }, ["path"]) },
      { name: "search_code", description: "Case-insensitive text search across the project. Returns path:line: text.", parameters: obj({ query: str }, ["query"]) },
      { name: "list_project_images", description: "Lists image files in the project, likely brand assets (logo, icon, screenshots) first.", parameters: obj({}) },
      {
        name: "place_project_image",
        description: "Copies an image from the project into the design and places it. Give w (and optionally h; by default the image keeps its aspect ratio). Returns the element id.",
        parameters: obj({ path: str, x: num, y: num, w: num, h: num, cornerRadius: num, name: str }, ["path", "x", "y", "w"]),
      },
    );
    if (vision) list.push({ name: "view_project_image", description: "Shows you an image from the project folder.", parameters: obj({ path: str }, ["path"]) });
    list.push(
      {
        name: "update_brand_kit",
        description: "Saves the brand kit shared by every design of this project: colors (hex), font families, logos (paths inside the project folder, copied into the kit) and a short note on voice. Values are added to the kit; set replace to overwrite it.",
        parameters: obj({
          colors: { type: "array", items: str }, fonts: { type: "array", items: str },
          logos_from_project: { type: "array", items: str, description: "Image paths relative to the project root" },
          voice: str, replace: { type: "boolean" },
        }),
      },
      {
        name: "place_brand_logo",
        description: "Places a logo from the brand kit (a path listed in the Brand kit section). Give w (and optionally h; by default it keeps its aspect ratio). Returns the element id.",
        parameters: obj({ path: str, x: num, y: num, w: num, h: num, name: str }, ["path", "x", "y", "w"]),
      },
    );
  }
  return list;
}

const r = (v: number) => Math.round(v * 10) / 10;

export function describe(): unknown {
  const { design } = useDesign.getState();
  const lines = textLines();
  return {
    name: design.name,
    page: `${(design.page ?? 0) + 1} of ${pageCount(design)}`,
    width: design.width,
    height: design.height,
    background: design.background,
    elements: design.elements.map((e) => {
      const { id, type, x, y, w, rotation, opacity, name, locked, hidden, shadow } = e;
      const h = e.type === "text" ? textHeight(lines[e.id]?.length ?? e.text.split("\n").length, e.fontSize, e.lineHeight) : e.h;
      const common = { id, type, name, x: r(x), y: r(y), w: r(w), h: r(h), rotation: rotation || undefined, opacity: opacity < 1 ? opacity : undefined, locked, hidden, shadow: shadow ?? undefined };
      if (e.type === "text") {
        const { text, fontFamily, fontSize, fontWeight, italic, fill, align, lineHeight, letterSpacing, uppercase, stroke, strokeWidth } = e;
        return { ...common, text, fontFamily, fontSize, fontWeight, italic, fill, align, lineHeight, letterSpacing, uppercase, stroke, strokeWidth };
      }
      if (e.type === "shape") return { ...common, shape: e.shape, fill: e.fill, stroke: e.stroke, strokeWidth: e.strokeWidth, cornerRadius: e.cornerRadius };
      return { ...common, cornerRadius: e.cornerRadius };
    }),
  };
}

/** Normalizes AI input into an element; unknown fonts fall back to Inter (installed ones the user picked are kept). */
function toElement(raw: Record<string, unknown>, id: string): El {
  const el = normalizeElement(raw, id);
  if (!el) throw new Error(`invalid element type ${String(raw.type)}; use text or shape`);
  if (el.type === "text") {
    if (!fontInfo(el.fontFamily)) el.fontFamily = "Inter";
    el.fontWeight = nearestWeight(el.fontFamily, el.fontWeight);
    if (typeof raw.h !== "number") el.h = el.fontSize * el.lineHeight;
  }
  return el;
}

/**
 * Lets the canvas lay out new text before the model reads measurements. The
 * timeout covers a hidden window, where animation frames stop (Claude Code may
 * drive the app from another terminal).
 */
const settle = async (els: El[]) => {
  await ensureFonts(els.flatMap((e) => (e.type === "text" ? [e.fontFamily] : [])));
  await Promise.race([
    new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))),
    new Promise((res) => setTimeout(res, 150)),
  ]);
};

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Runs one of `tools()` against the open design. */
export async function exec(name: string, a: ToolArgs): Promise<unknown> {
  const store = useDesign.getState();
  switch (name) {
    case "get_design":
      return describe();
    case "add_page":
      store.addPage(a.copy_current === true);
      await settle(useDesign.getState().design.elements);
      return describe();
    case "go_to_page":
    case "remove_page": {
      const total = pageCount(store.design);
      const n = Math.round(Number(a.page));
      if (!(n >= 1 && n <= total)) throw new Error(`page must be between 1 and ${total}`);
      if (name === "go_to_page") store.openPage(n - 1);
      else if (total < 2) throw new Error("the last page cannot be deleted");
      else store.removePage(n - 1);
      await settle(useDesign.getState().design.elements);
      return describe();
    }
    case "resize_design": {
      const { width, height } = resizeTarget(a);
      const next = resizeLayout(store.design, width, height);
      store.update((d) => Object.assign(d, { width: next.width, height: next.height, elements: next.elements, pages: next.pages }));
      useUi.getState().setZoom(null);
      await settle(next.elements);
      return describe();
    }
    case "rename_design": {
      const title = typeof a.name === "string" ? a.name.trim().slice(0, 80) : "";
      if (!title) throw new Error("name must not be empty");
      store.update((d) => void (d.name = title));
      return { ok: true };
    }
    case "set_canvas":
      store.update((d) => {
        if (a.background !== undefined) d.background = normalizeFill(a.background, "#ffffff");
        if (typeof a.width === "number") d.width = Math.round(Math.min(10000, Math.max(16, a.width)));
        if (typeof a.height === "number") d.height = Math.round(Math.min(10000, Math.max(16, a.height)));
      });
      return { ok: true };
    case "clear_design":
      store.update((d) => void (d.elements = d.elements.filter((e) => e.type === "image")));
      store.select([]);
      return { ok: true };
    case "add_elements": {
      if (!Array.isArray(a.elements)) throw new Error("elements must be an array");
      const els = (a.elements as Record<string, unknown>[]).map((e) => toElement(e, ""));
      const added = store.add(els.map(({ id: _id, ...e }) => e));
      await settle(els);
      return { ids: added };
    }
    case "update_elements": {
      if (!Array.isArray(a.updates)) throw new Error("updates must be an array");
      const missing: string[] = [];
      const patches = (a.updates as Record<string, unknown>[]).flatMap((u) => {
        const cur = store.design.elements.find((e) => e.id === u.id);
        if (!cur) return missing.push(String(u.id)), [];
        const { id: _id, ...rest } = u;
        const next = cur.type === "image" ? normalizeElement({ ...cur, ...rest, type: "image", src: cur.src }, cur.id) : toElement({ ...cur, ...rest, type: cur.type }, cur.id);
        return next ? [{ id: cur.id, patch: next }] : [];
      });
      store.patchMany(patches);
      await settle(patches.map((p) => p.patch as El));
      return missing.length ? { updated: patches.length, not_found: missing } : { updated: patches.length };
    }
    case "remove_elements":
      store.remove(ids(a.ids));
      return { ok: true };
    case "reorder":
      store.reorder(ids(a.ids), (["front", "back", "forward", "backward"].includes(String(a.to)) ? a.to : "front") as Reorder);
      return { ok: true };
    case "view_design": {
      const { width, height } = store.design;
      const url = renderPage(Math.min(1, 1024 / Math.max(width, height)), "image/jpeg", 0.85);
      return new WithImage("Rendered page attached below.", { mediaType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) });
    }
    case "list_files":
      return (await ipc.wsListFiles(ws(), String(a.dir ?? ""), typeof a.depth === "number" ? a.depth : 2)).join("\n");
    case "read_file":
      return ipc.wsReadFile(ws(), String(a.path));
    case "search_code": {
      const hits = await ipc.wsSearch(ws(), String(a.query));
      return hits.length ? hits.join("\n") : "no matches";
    }
    case "list_design_images": {
      const srcs = await ipc.mediaList(store.design.id);
      if (!srcs.length) return "no images are stored with this design";
      const sizes = await Promise.all(srcs.map((src) => loadImage(src).then((i) => `${i.naturalWidth}×${i.naturalHeight}`, () => "unreadable")));
      return srcs.map((src, i) => `${src} (${sizes[i]})`).join("\n");
    }
    case "view_design_image": {
      const src = await designImage(String(a.path));
      const img = await loadImage(src);
      return new WithImage(`${src} (${img.naturalWidth}×${img.naturalHeight})`, { mediaType: "image/jpeg", data: jpegBase64(img) });
    }
    case "place_design_image":
      return addImage(await designImage(String(a.path)), a);
    case "list_installed_fonts": {
      await loadSystemFonts();
      const q = typeof a.query === "string" ? a.query.trim().toLowerCase() : "";
      const list = useFonts.getState().system.filter((f) => !q || f.family.toLowerCase().includes(q));
      if (!list.length) return q ? `no installed font matches "${q}"` : "no installed fonts found";
      return list.slice(0, 400).map((f) => `${f.family} (weights ${f.weights.join("/")}${f.italic ? "; italic" : ""})`).join("\n");
    }
    case "update_brand_kit": {
      const id = ws();
      const imported: string[] = [];
      for (const rel of Array.isArray(a.logos_from_project) ? a.logos_from_project.map(String) : []) imported.push(await ipc.brandLogoImport(id, { rel }));
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
      const kit = await updateBrand(id, (k) =>
        a.replace === true
          ? normalizeBrand({ colors: list(a.colors), fonts: list(a.fonts), logos: imported.length ? imported : k.logos, voice: typeof a.voice === "string" ? a.voice : "" })
          : normalizeBrand({ colors: [...k.colors, ...list(a.colors)], fonts: [...k.fonts, ...list(a.fonts)], logos: [...k.logos, ...imported], voice: typeof a.voice === "string" && a.voice.trim() ? a.voice : k.voice }),
      );
      return kit;
    }
    case "place_brand_logo": {
      const path = String(a.path);
      if (!brandOf(ws()).logos.includes(path)) throw new Error("not a logo of the brand kit; use a path from the Brand kit section");
      const src = await ipc.mediaImport(store.design.id, path);
      mediaChanged();
      return addImage(src, a);
    }
    case "list_project_images": {
      const imgs = await ipc.wsImages(ws());
      return imgs.length ? imgs.join("\n") : "no images in the project";
    }
    case "view_project_image": {
      const img = await loadWorkspaceImage(ws(), String(a.path));
      return new WithImage(`${String(a.path)} (${img.naturalWidth}×${img.naturalHeight})`, { mediaType: "image/jpeg", data: jpegBase64(img) });
    }
    case "place_project_image": {
      const src = await ipc.wsImageImport(store.design.id, ws(), String(a.path));
      mediaChanged();
      return addImage(src, a);
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/** Target size of resize_design: a preset id, or width and height. */
export function resizeTarget(a: ToolArgs): { width: number; height: number; preset?: string } {
  const preset = SIZE_PRESETS.find((p) => p.id === a.size);
  const width = Math.round(preset?.width ?? Number(a.width));
  const height = Math.round(preset?.height ?? Number(a.height));
  if (!(width >= 16 && height >= 16 && width <= 10000 && height <= 10000)) throw new Error("give a size preset, or width and height between 16 and 10000");
  return { width, height, preset: preset?.id };
}

/** Places a stored image (x, y, w and optional h, cornerRadius, name from the tool input). */
export async function addImage(src: string, a: ToolArgs) {
  const img = await loadImage(src);
  const w = Math.max(1, Number(a.w) || 200);
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 1;
  const h = typeof a.h === "number" && a.h > 0 ? a.h : w * ratio;
  const [id] = useDesign.getState().add([{
    type: "image", src, x: Number(a.x) || 0, y: Number(a.y) || 0, w, h, rotation: 0, opacity: 1,
    name: typeof a.name === "string" ? a.name : undefined, cornerRadius: typeof a.cornerRadius === "number" ? a.cornerRadius : undefined,
  }]);
  return { id, w, h: Math.round(h) };
}

/** A path from list_design_images; anything else is refused. */
async function designImage(path: string): Promise<string> {
  const srcs = await ipc.mediaList(useDesign.getState().design.id);
  if (!srcs.includes(path)) throw new Error("not an image of this design; use a path from list_design_images");
  return path;
}

function ws(): string {
  const ws = linkedWorkspace(useDesign.getState().design.workspaceId);
  if (!ws) throw new Error("no project folder is linked to this design");
  return ws.id;
}

export interface AgentCallbacks {
  onText(delta: string): void;
  onMessage(m: Message): void;
  onTool(name: string, input: ToolArgs, result: string, isError: boolean): void;
}

/** Runs the agent on `history` (extended in place); all its edits form one undo step. */
export async function runAgent(history: Message[], cb: AgentCallbacks, signal: { cancelled: boolean }): Promise<string> {
  const vision = activeVision();
  // Only a folder that is still linked; an unlinked one would fail every read.
  const wsId = linkedWorkspace(useDesign.getState().design.workspaceId)?.id;
  // A first look at the linked project, so research starts from the README and file tree.
  const overview = wsId ? await ipc.wsOverview(wsId) : null;
  if (wsId) await loadBrand(wsId).catch(() => {});
  return asOneStep(() =>
    runToolLoop({ system: system(vision, overview), history, tools: tools(vision, !!overview), exec, signal, maxSteps: overview ? 40 : 24, ...cb }),
  );
}
