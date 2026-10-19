import { create } from "zustand";
import type { DesignMeta, Workspace } from "../lib/ipc";
import { ipc } from "../lib/ipc";
import { useUi } from "./ui";

/** Designs without a (still linked) project folder are grouped under this id. */
export const NO_WORKSPACE = "__none";

interface AppState {
  view: "home" | "editor";
  designs: DesignMeta[];
  workspaces: Workspace[];
  /** Selected workspace on the home screen, or NO_WORKSPACE. */
  workspaceId: string;
  refresh(): Promise<void>;
  selectWorkspace(id: string): void;
  openEditor(): void;
  goHome(): void;
}

/** The workspace a design belongs to on the home screen. */
export const groupOf = (d: { workspaceId: string | null | undefined }, workspaces: Workspace[]) =>
  d.workspaceId && workspaces.some((w) => w.id === d.workspaceId) ? d.workspaceId : NO_WORKSPACE;

export const useApp = create<AppState>()((set, get) => ({
  view: "home",
  designs: [],
  workspaces: [],
  workspaceId: NO_WORKSPACE,
  refresh: async () => {
    const [designs, workspaces] = await Promise.all([ipc.designs(), ipc.workspaces()]);
    const cur = get().workspaceId;
    const valid = cur === NO_WORKSPACE ? designs.some((d) => groupOf(d, workspaces) === NO_WORKSPACE) || !workspaces.length : workspaces.some((w) => w.id === cur);
    set({ designs, workspaces, workspaceId: valid ? cur : (workspaces[0]?.id ?? NO_WORKSPACE) });
  },
  selectWorkspace: (workspaceId) => set({ workspaceId }),
  openEditor: () => set({ view: "editor" }),
  goHome: () => {
    set({ view: "home" });
    useUi.getState().open(null);
    void get().refresh();
  },
}));
