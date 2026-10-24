// Tools the local MCP server offers to the user's own Claude Code. The Rust
// side relays each call here; edits go through the same stores as the UI, so
// the canvas updates live and everything can be undone.
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Channel, invoke } from "@tauri-apps/api/core";
import { SIZE_PRESETS } from "../types/design";
import { useDesign } from "../store/design";
import { useApp } from "../store/app";
import { useChat } from "../store/chat";
import { addImage, describe, designGuide, exec as execDesignTool, resizeTarget, tools as designTools } from "./agent";
import { magicResize } from "./magicResize";
import { t } from "../i18n";
import { mediaChanged } from "./media";
import { buildExport, numberedPath, type ExportFormat } from "./export";
import { createDesign, leaveDesign, loadDesign } from "./library";
import { ipc, type ToolDef } from "./ipc";
import { WithImage, type ToolArgs } from "./toolLoop";

export interface McpInfo {
  url: string;
  token: string;
}

type McpCall = { id: number; name: string; arguments: ToolArgs };
type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

const INSTRUCTIONS = `KlikDesign is the desktop design editor (posters, social posts, banners) the user has open. These tools edit the design currently open in it; the user sees every change live on the canvas and can undo it.

Workflow:
1. If no design is open, or the user means another one, use list_designs, then open_design or create_design. The workspace whose path matches your working directory is usually the right one.
2. Call get_design_guide once: it has the page size, the element model, the fonts you may use and the design rules. Follow it.
3. get_design before editing; never invent element ids.
4. Build or revise with set_canvas, add_elements, update_elements, remove_elements and reorder; group parts that belong together with group_elements. Place pictures with place_design_image (images the user already added to this design; see list_design_images), place_image (any file on this computer) or place_project_image (from the linked project folder).
5. view_design after a build or larger change, and fix overlaps, cut-off text, poor contrast or awkward spacing.
6. To adapt a design to another format (post to story, banner…), call resize_design (copy: true keeps the original and opens the copy), then re-lay it out with update_elements and check it with view_design.
7. Give an untitled design a short title with rename_design.
8. For a carousel or slide set, add pages with add_page and switch with go_to_page; the editing tools act on the open page.
9. export_design when the user asks for a file (all_pages for every page of a carousel).

The user's product codebase is usually your current working directory: read it for real names, wording, brand colors and logos.`;

const str = { type: "string" };
const num = { type: "number" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

// Claude Code reads the project folder with its own tools.
const SKIPPED = new Set(["list_files", "read_file", "search_code"]);

const TOOLS: ToolDef[] = [
  {
    name: "list_designs",
    description: "Lists the workspaces (product folders) known to KlikDesign and the designs in each, and which design is open.",
    parameters: obj({}),
  },
  {
    name: "open_design",
    description: "Opens a design in KlikDesign (saving the one that is open). All other tools then act on it.",
    parameters: obj({ design_id: str }, ["design_id"]),
  },
  {
    name: "create_design",
    description: "Creates an empty design and opens it. Pick a size preset or give width and height. Link it to a product folder with workspace_id (from list_designs) or workspace_path (added as a workspace if needed).",
    parameters: obj({
      name: str,
      size: { type: "string", enum: SIZE_PRESETS.map((p) => p.id), description: SIZE_PRESETS.map((p) => `${p.id} ${p.width}x${p.height}`).join(", ") },
      width: num, height: num, workspace_id: str, workspace_path: str,
    }, ["name"]),
  },
  { name: "get_design_guide", description: "Returns the page size, element model, available fonts and design rules to follow.", parameters: obj({}) },
  ...designTools(true, true)
    .filter((t) => !SKIPPED.has(t.name))
    .map((t) =>
      t.name === "resize_design"
        ? { ...t, parameters: { ...t.parameters, properties: { ...(t.parameters.properties as object), copy: { type: "boolean", description: "Resize a copy (opened in its place) and keep the original as it is" } } } }
        : t,
    ),
  {
    name: "place_image",
    description: "Copies an image file from this computer into the design and places it. Give w (and optionally h; by default it keeps its aspect ratio). Returns the element id.",
    parameters: obj({ path: { ...str, description: "Absolute path to a PNG, JPG, WebP, GIF or SVG" }, x: num, y: num, w: num, h: num, cornerRadius: num, name: str }, ["path", "x", "y", "w"]),
  },
  {
    name: "export_design",
    description: "Exports the open design to a file. scale multiplies the page size (default 1; 2 for print-quality PNG/PDF). With all_pages, a PDF holds every page and PNG/JPG/SVG write one file per page (path-1.png, path-2.png…).",
    parameters: obj({ path: { ...str, description: "Absolute output path" }, format: { type: "string", enum: ["png", "jpg", "pdf", "svg"] }, scale: num, all_pages: { type: "boolean" } }, ["path", "format"]),
  },
];

const s = (v: unknown) => (typeof v === "string" ? v : undefined);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const trimSlash = (p: string) => p.replace(/[\\/]+$/, "");

async function listDesigns() {
  const [workspaces, designs] = await Promise.all([ipc.workspaces(), ipc.designs()]);
  const open = useApp.getState().view === "editor" ? useDesign.getState().design.id : null;
  const entry = (d: (typeof designs)[number]) => ({ id: d.id, name: d.name, size: `${d.width}x${d.height}`, open: d.id === open });
  const known = new Set(workspaces.map((w) => w.id));
  return {
    open_design_id: open,
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, path: w.path, designs: designs.filter((d) => d.workspaceId === w.id).map(entry) })),
    unlinked_designs: designs.filter((d) => !d.workspaceId || !known.has(d.workspaceId)).map(entry),
  };
}

async function workspaceFor(a: ToolArgs): Promise<string | null> {
  if (s(a.workspace_id)) {
    if (!(await ipc.workspaces()).some((w) => w.id === a.workspace_id)) throw new Error(`workspace ${String(a.workspace_id)} not found; call list_designs`);
    return s(a.workspace_id)!;
  }
  if (!s(a.workspace_path)) return null;
  const path = trimSlash(s(a.workspace_path)!);
  const known = (await ipc.workspaces()).find((w) => trimSlash(w.path) === path);
  const id = known?.id ?? (await ipc.workspaceAdd(path)).id;
  await useApp.getState().refresh();
  return id;
}

async function placeImage(a: ToolArgs) {
  const path = String(a.path ?? "");
  if (!/^(\/|[A-Za-z]:[\\/])/.test(path)) throw new Error("path must be an absolute file path");
  const src = await ipc.mediaImport(useDesign.getState().design.id, path);
  mediaChanged();
  return addImage(src, a);
}

async function exportFile(a: ToolArgs) {
  const format = String(a.format) as ExportFormat;
  if (!["png", "jpg", "pdf", "svg"].includes(format)) throw new Error("format must be png, jpg, pdf or svg");
  const path = String(a.path ?? "");
  const scale = Math.min(4, Math.max(0.1, n(a.scale) ?? 1));
  const files = await buildExport(format, scale, a.all_pages === true);
  const paths = files.length > 1 ? files.map((_, i) => numberedPath(path, i + 1)) : [path];
  for (const [i, bytes] of files.entries()) {
    let bin = "";
    for (let j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode(...bytes.subarray(j, j + 0x8000));
    await invoke("export_write", { path: paths[i], data: btoa(bin) });
  }
  return { ok: true, paths, bytes: files.reduce((n, f) => n + f.length, 0) };
}

async function run(name: string, a: ToolArgs): Promise<unknown> {
  switch (name) {
    case "list_designs":
      return listDesigns();
    case "resize_design": {
      if (a.copy !== true) return execDesignTool(name, a);
      const { width, height, preset } = resizeTarget(a);
      await magicResize({ width, height, label: preset ? t(`size.${preset}` as "size.custom") : `${width}×${height}`, copy: true, ai: false });
      return { designId: useDesign.getState().design.id, ...(describe() as object) };
    }
    case "open_design": {
      const id = String(a.design_id ?? "");
      if (!(await ipc.designs()).some((d) => d.id === id)) throw new Error(`design ${id} not found; call list_designs`);
      if (useApp.getState().view === "editor" && useDesign.getState().design.id === id) return { ok: true, already_open: true };
      await leaveDesign();
      await loadDesign(id);
      return { ok: true, name: useDesign.getState().design.name };
    }
    case "create_design": {
      const workspaceId = await workspaceFor(a);
      const preset = SIZE_PRESETS.find((p) => p.id === a.size);
      const width = Math.round(n(a.width) ?? preset?.width ?? 1080);
      const height = Math.round(n(a.height) ?? preset?.height ?? 1350);
      await leaveDesign();
      await createDesign({ ...(s(a.name)?.trim() ? { name: s(a.name)!.trim() } : {}), width, height, workspaceId });
      return { ok: true, design_id: useDesign.getState().design.id, size: `${width}x${height}` };
    }
    case "get_design_guide":
      return await designGuide();
    case "get_design":
      return describe();
    case "place_image":
      return placeImage(a);
    case "export_design":
      return exportFile(a);
    default:
      return execDesignTool(name, a);
  }
}

const ALLOWED = new Set(TOOLS.map((t) => t.name));
const DESIGNLESS = new Set(["list_designs", "open_design", "create_design"]);
const READ_ONLY = new Set(["list_designs", "get_design_guide", "get_design", "view_design", "list_project_images", "view_project_image", "list_design_images", "view_design_image", "list_installed_fonts"]);

function toContent(out: unknown): Content[] {
  if (out instanceof WithImage) return [{ type: "text", text: out.content }, { type: "image", data: out.image.data, mimeType: out.image.mediaType }];
  return [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out, null, 1) }];
}

async function handle(call: McpCall) {
  let result: { content: Content[]; isError?: boolean };
  try {
    if (!ALLOWED.has(call.name)) throw new Error(`unknown tool: ${call.name}`);
    if (!DESIGNLESS.has(call.name) && useApp.getState().view !== "editor") throw new Error("No design is open in KlikDesign. Use list_designs, then open_design or create_design.");
    // The in-app AI writes into the open design too; never interleave with it.
    if (!READ_ONLY.has(call.name) && useChat.getState().busy) throw new Error("KlikDesign's own AI is editing this design right now; wait until it finishes and try again.");
    result = { content: toContent(await run(call.name, call.arguments ?? {})) };
  } catch (e) {
    result = { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
  await invoke("mcp_reply", { id: call.id, result });
}

export interface McpLink {
  running: boolean;
  connected: boolean;
  client: string | null;
  idleSecs: number | null;
}

interface McpState {
  enabled: boolean;
  info: McpInfo | null;
  link: McpLink | null;
  setEnabled(on: boolean): Promise<void>;
}

export const useMcp = create<McpState>()(
  persist(
    (set) => ({
      enabled: false,
      info: null,
      link: null,
      setEnabled: async (enabled) => {
        if (!enabled) {
          await invoke("mcp_stop");
          set({ enabled, info: null, link: null });
          return;
        }
        const onCall = new Channel<McpCall>();
        onCall.onmessage = (c) => void handle(c);
        const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters }));
        const info = await invoke<McpInfo>("mcp_start", { tools, instructions: INSTRUCTIONS, onCall });
        set({ enabled, info });
      },
    }),
    { name: "klikdesign-mcp", partialize: (s) => ({ enabled: s.enabled }) },
  ),
);

/** Polls whether Claude Code is connected while the server runs. */
export function useMcpLink(): McpLink | null {
  const enabled = useMcp((s) => s.enabled);
  useEffect(() => {
    if (!enabled) return;
    const poll = () => invoke<McpLink>("mcp_link").then((link) => useMcp.setState({ link }), () => {});
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [enabled]);
  return useMcp((s) => (s.enabled ? s.link : null));
}

/**
 * Restarts the server on launch when the user left it on. Runs on every
 * evaluation of this module: after a dev hot reload re-creates the stores,
 * the bridge must point at the new ones or edits land in stale state.
 */
if (useMcp.getState().enabled) useMcp.getState().setEnabled(true).catch(() => useMcp.setState({ enabled: false }));

export const addCommand = (info: McpInfo) =>
  `claude mcp add --transport http --scope user klikdesign ${info.url} --header "Authorization: Bearer ${info.token}"`;
