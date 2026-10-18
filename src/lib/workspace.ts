// Linked project folders: the AI researches them to design on-brand posters.
import { open } from "@tauri-apps/plugin-dialog";
import { useApp } from "../store/app";
import { useDesign } from "../store/design";
import { t } from "../i18n";
import { ipc, type Workspace } from "./ipc";

/** Asks for a folder and links it; returns the workspace, or null when cancelled. */
export async function addWorkspace(): Promise<Workspace | null> {
  const path = await open({ directory: true, title: t("ws.pick") });
  if (!path || Array.isArray(path)) return null;
  const ws = await ipc.workspaceAdd(path);
  await useApp.getState().refresh();
  return ws;
}

/** Links the open design to a project folder (or unlinks it with null). */
export function linkDesign(workspaceId: string | null) {
  useDesign.getState().update((d) => void (d.workspaceId = workspaceId));
}

export const workspaceName = (id: string | null | undefined) => useApp.getState().workspaces.find((w) => w.id === id)?.name;
