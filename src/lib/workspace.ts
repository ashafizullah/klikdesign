// Linked project folders: the AI researches them to design on-brand posters.
import { open } from "@tauri-apps/plugin-dialog";
import { useApp } from "../store/app";
import { t } from "../i18n";
import { ipc, type Workspace } from "./ipc";

/** Asks for a folder and links it; returns the workspace, or null when cancelled. */
export async function addWorkspace(): Promise<Workspace | null> {
  const path = await open({ directory: true, title: t("ws.pick") });
  if (!path || Array.isArray(path)) return null;
  const ws = await ipc.workspaceAdd(path);
  await useApp.getState().refresh();
  useApp.getState().selectWorkspace(ws.id);
  return ws;
}

export const workspaceName = (id: string | null | undefined) => useApp.getState().workspaces.find((w) => w.id === id)?.name;

/** The design's project folder, if it is still linked. */
export const linkedWorkspace = (id: string | null | undefined) => useApp.getState().workspaces.find((w) => w.id === id) ?? null;
