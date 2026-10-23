// Typed wrappers over the Rust commands.
import { Channel, invoke } from "@tauri-apps/api/core";

export type Role = "user" | "assistant";
export type Part =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string }
  | { type: "toolCall"; id: string; name: string; input: Record<string, unknown>; meta?: unknown }
  | { type: "toolResult"; id: string; name: string; content: string; isError?: boolean }
  | { type: "opaque"; provider: string; block: unknown };
export interface Message {
  role: Role;
  content: Part[];
}
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface Connection {
  format: string;
  profileId: string;
  model: string;
  baseUrl?: string | null;
}
export interface ChatRequest extends Connection {
  effort?: string | null;
  system?: string;
  messages: Message[];
  tools?: ToolDef[];
  maxTokens?: number;
}
export interface ChatResult {
  message: Message;
  stopReason: string;
}
type AiStreamEvent = { type: "textDelta"; text: string };

export interface DesignMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: number;
  /** Bytes on disk (design file + imported images). */
  size: number;
  /** Small PNG data URI. */
  thumb: string | null;
  workspaceId: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

export type TerminalEvent = { type: "data"; data: string } | { type: "exit"; code: number | null };

export const ipc = {
  apiKeysStatus: (profileIds: string[]) => invoke<Record<string, boolean>>("api_keys_status", { profileIds }),
  apiKeySet: (profileId: string, key: string) => invoke<void>("api_key_set", { profileId, key }),
  apiKeyDelete: (profileId: string) => invoke<void>("api_key_delete", { profileId }),

  models: (request: Omit<Connection, "model">) => invoke<string[]>("ai_models", { request }),

  chat: (request: ChatRequest, onText?: (t: string) => void) => {
    const ch = new Channel<AiStreamEvent>();
    ch.onmessage = (e) => onText?.(e.text);
    return invoke<ChatResult>("ai_chat", { request, onEvent: ch });
  },

  designs: () => invoke<DesignMeta[]>("designs_list"),
  designStore: (id: string, json: string) => invoke<void>("design_store", { id, json }),
  designFetch: (id: string) => invoke<string>("design_fetch", { id }),
  designDelete: (id: string) => invoke<void>("design_delete", { id }),
  mediaImport: (id: string, path: string) => invoke<string>("media_import", { id, path }),
  mediaList: (id: string) => invoke<string[]>("media_list", { id }),
  mediaBytes: (path: string) => invoke<ArrayBuffer>("media_bytes", { path }),

  workspaces: () => invoke<Workspace[]>("workspaces_list"),
  workspaceAdd: (path: string, name?: string) => invoke<Workspace>("workspace_add", { path, name }),
  workspaceRename: (id: string, name: string) => invoke<void>("workspace_rename", { id, name }),
  workspaceRemove: (id: string) => invoke<void>("workspace_remove", { id }),
  wsOverview: (workspaceId: string) => invoke<string>("ws_overview", { workspaceId }),
  wsListFiles: (workspaceId: string, dir: string, depth?: number) => invoke<string[]>("ws_list_files", { workspaceId, dir, depth }),
  wsReadFile: (workspaceId: string, path: string) => invoke<string>("ws_read_file", { workspaceId, path }),
  wsSearch: (workspaceId: string, query: string) => invoke<string[]>("ws_search", { workspaceId, query }),
  wsImages: (workspaceId: string) => invoke<string[]>("ws_images", { workspaceId }),
  wsImageBytes: (workspaceId: string, path: string) => invoke<ArrayBuffer>("ws_image_bytes", { workspaceId, path }),
  terminalOpen: (cwd: string, cols: number, rows: number, onEvent: (e: TerminalEvent) => void) => {
    const ch = new Channel<TerminalEvent>();
    ch.onmessage = onEvent;
    return invoke<string>("terminal_open", { cwd, cols, rows, onEvent: ch });
  },
  terminalWrite: (id: string, data: string) => invoke<void>("terminal_write", { id, data }),
  terminalResize: (id: string, cols: number, rows: number) => invoke<void>("terminal_resize", { id, cols, rows }),
  terminalClose: (id: string) => invoke<void>("terminal_close", { id }),
  wsImageImport: (designId: string, workspaceId: string, path: string) => invoke<string>("ws_image_import", { designId, workspaceId, path }),
};
