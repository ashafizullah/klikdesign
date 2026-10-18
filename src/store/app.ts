import { create } from "zustand";
import type { DesignMeta, Workspace } from "../lib/ipc";
import { ipc } from "../lib/ipc";
import { useUi } from "./ui";

interface AppState {
  view: "home" | "editor";
  designs: DesignMeta[];
  workspaces: Workspace[];
  refresh(): Promise<void>;
  openEditor(): void;
  goHome(): void;
}

export const useApp = create<AppState>()((set, get) => ({
  view: "home",
  designs: [],
  workspaces: [],
  refresh: async () => {
    const [designs, workspaces] = await Promise.all([ipc.designs(), ipc.workspaces()]);
    set({ designs, workspaces });
  },
  openEditor: () => set({ view: "editor" }),
  goHome: () => {
    set({ view: "home" });
    useUi.getState().open(null);
    void get().refresh();
  },
}));
