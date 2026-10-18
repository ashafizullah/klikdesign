import { create } from "zustand";
import { localizeMessage } from "../i18n";

export type LeftTab = "templates" | "text" | "shapes" | "uploads";
export type RightTab = "design" | "layers" | "ai";

interface UiState {
  leftTab: LeftTab;
  rightTab: RightTab;
  setLeftTab(t: LeftTab): void;
  setRightTab(t: RightTab): void;
  /** Canvas zoom (screen px per page px); null means fit to the viewport. */
  zoom: number | null;
  setZoom(z: number | null): void;
  /** Zoom that fits the page in the viewport (set by the canvas). */
  fitZoom: number;
  setFitZoom(z: number): void;
  /** Element whose text is being edited in place. */
  editingTextId: string | null;
  setEditingText(id: string | null): void;
  dialog: null | "settings" | "export";
  toast: { kind: "info" | "error"; text: string } | null;
  open(d: UiState["dialog"]): void;
  notify(text: string, kind?: "info" | "error"): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>()((set) => ({
  leftTab: "templates",
  rightTab: "design",
  setLeftTab: (leftTab) => set({ leftTab }),
  setRightTab: (rightTab) => set({ rightTab }),
  zoom: null,
  setZoom: (zoom) => set({ zoom: zoom === null ? null : Math.min(8, Math.max(0.05, zoom)) }),
  fitZoom: 1,
  setFitZoom: (fitZoom) => set({ fitZoom }),
  editingTextId: null,
  setEditingText: (editingTextId) => set({ editingTextId }),
  dialog: null,
  toast: null,
  open: (dialog) => set({ dialog }),
  notify: (text, kind = "info") => {
    clearTimeout(toastTimer);
    set({ toast: { text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), kind === "error" ? 7000 : 3500);
  },
}));

export const notifyError = (e: unknown) =>
  useUi.getState().notify(localizeMessage(e instanceof Error ? e.message : String(e)), "error");
