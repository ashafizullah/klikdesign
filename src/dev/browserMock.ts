// Dev-only: lets the UI run in a plain browser (vite dev server) with fake
// IPC so layout and interactions can be exercised without the Tauri shell.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

const designs = new Map<string, string>();
const media = new Map<string, Uint8Array>();
let chatCalls = 0;
const workspaces = [{ id: "ws_demo", name: "kopi-senja-app", path: "/Users/dev/Projects/kopi-senja-app", createdAt: Date.now() }];

const demoSvg = (hue: number) =>
  new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 80% 60%)"/><stop offset="1" stop-color="hsl(${hue + 60} 80% 40%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="560" cy="220" r="120" fill="#fff" fill-opacity=".5"/></svg>`,
  );

mockWindows("main");

mockIPC(async (cmd, args) => {
  const a = (args ?? {}) as Record<string, any>;
  const req = a.request ?? {};
  switch (cmd) {
    case "api_keys_status":
      return Object.fromEntries((a.profileIds ?? []).map((id: string) => [id, true]));
    case "api_key_set":
    case "api_key_delete":
      return null;
    case "designs_list":
      return [...designs.values()].map((j) => JSON.parse(j)).map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height, updatedAt: Date.now(), size: JSON.stringify(d).length, thumb: d.thumb ?? null }));
    case "design_store":
      designs.set(a.id, a.json);
      return null;
    case "design_fetch":
      return designs.get(a.id);
    case "design_delete":
      designs.delete(a.id);
      return null;
    case "media_import": {
      const path = `/mock/${a.id}/media/${media.size}.svg`;
      media.set(path, demoSvg(media.size * 70));
      return path;
    }
    case "media_bytes":
      return (media.get(a.path) ?? demoSvg(200)).buffer;
    case "workspaces_list":
      return workspaces;
    case "workspace_add":
      return workspaces[0];
    case "workspace_remove":
    case "workspace_rename":
      return null;
    case "ws_overview":
      return "Workspace: kopi-senja-app\nsrc/\npublic/logo.svg\n\n## README.md\n# Kopi Senja\nPesan kopi susu gula aren, antar 15 menit.";
    case "ws_list_files":
      return ["src/", "public/", "public/logo.svg", "README.md"];
    case "ws_read_file":
      return "# Kopi Senja\nPesan kopi susu gula aren, antar 15 menit.";
    case "ws_search":
      return ["tailwind.config.ts:8: primary: '#7a3e1d'"];
    case "ws_images":
      return ["public/logo.svg", "public/screenshot-home.png"];
    case "ws_image_bytes":
      return demoSvg(20).buffer;
    case "ws_image_import": {
      const path = `/mock/${a.designId}/media/${media.size}.svg`;
      media.set(path, demoSvg(20));
      return path;
    }
    case "ai_chat": {
      chatCalls++;
      await new Promise((r) => setTimeout(r, 400));
      const last = req.messages?.[req.messages.length - 1];
      const afterTools = last?.content?.some((p: any) => p.type === "toolResult");
      const research = req.tools?.some((t: any) => t.name === "place_project_image");
      const done = (n: string) => req.messages.some((m: any) => m.content.some((p: any) => p.type === "toolResult" && p.name === n));
      if (research && !done("read_file")) {
        return { stopReason: "tool_use", message: { role: "assistant", content: [
          { type: "toolCall", id: `r${chatCalls}a`, name: "read_file", input: { path: "README.md" } },
          { type: "toolCall", id: `r${chatCalls}b`, name: "list_project_images", input: {} },
        ] } };
      }
      if (research && !done("place_project_image")) {
        return { stopReason: "tool_use", message: { role: "assistant", content: [
          { type: "toolCall", id: `r${chatCalls}c`, name: "place_project_image", input: { path: "public/logo.svg", x: 90, y: 1100, w: 200 } },
        ] } };
      }
      if (!afterTools || (research && !done("add_elements"))) {
        return {
          stopReason: "tool_use",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Sure, building it now." },
              { type: "toolCall", id: `c${chatCalls}a`, name: "set_canvas", input: { background: { kind: "linear", angle: 120, colors: ["#101828", "#7c5cff"] } } },
              {
                type: "toolCall", id: `c${chatCalls}b`, name: "add_elements",
                input: {
                  elements: [
                    { type: "shape", shape: "ellipse", x: 600, y: -120, w: 600, h: 600, fill: "#22d3c5", opacity: 0.5 },
                    { type: "text", x: 90, y: 160, w: 900, text: "Kopi Senja Festival", fontFamily: "Playfair Display", fontSize: 120, fontWeight: 700, fill: "#ffffff", lineHeight: 1.05 },
                    { type: "text", x: 90, y: 560, w: 800, text: "Live music, local roasters and late-night brews.", fontFamily: "Inter", fontSize: 40, fill: "#e5e7eb", lineHeight: 1.4 },
                  ],
                },
              },
            ],
          },
        };
      }
      return { stopReason: "end_turn", message: { role: "assistant", content: [{ type: "text", text: "Done (mock): a dark gradient poster with a serif headline." }] } };
    }
    case "plugin:dialog|open":
      return ["/Users/dev/Pictures/photo.png"];
    case "plugin:dialog|ask":
      return true;
    case "plugin:dialog|save":
      return "/Users/dev/Desktop/design.png";
    case "plugin:fs|write_file":
      // Kept for inspection from the dev tools / e2e scripts.
      (window as unknown as { __lastWrite: unknown }).__lastWrite = args;
      return null;
    case "plugin:opener|reveal_item_in_dir":
      return null;
    case "plugin:event|listen":
      return 1;
    case "plugin:event|unlisten":
      return null;
    default:
      throw new Error(`${cmd} is not available in browser mode`);
  }
});
