import { create } from "zustand";
import { localizeMessage } from "../i18n";

export type LeftTab = "templates" | "text" | "shapes" | "uploads" | "brand";
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
  /** Image whose crop is being adjusted on the canvas. */
  croppingId: string | null;
  setCropping(id: string | null): void;
  dialog: null | "settings" | "export" | "resize";
  /** In-app terminal panel visibility. */
  terminal: boolean;
  toggleTerminal(): void;
  toast: { kind: "info" | "error"; text: string } | null;
  /** Pending in-app confirmation; see `confirm()`. */
  confirm: (ConfirmOptions & { resolve(ok: boolean): void }) | null;
  open(d: UiState["dialog"]): void;
  notify(text: string, kind?: "info" | "error"): void;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
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
  croppingId: null,
  setCropping: (croppingId) => set({ croppingId }),
  dialog: null,
  terminal: false,
  toggleTerminal: () => set((s) => ({ terminal: !s.terminal })),
  toast: null,
  confirm: null,
  open: (dialog) => set({ dialog }),
  notify: (text, kind = "info") => {
    clearTimeout(toastTimer);
    set({ toast: { text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), kind === "error" ? 7000 : 3500);
  },
}));

export const notifyError = (e: unknown) =>
  useUi.getState().notify(localizeMessage(e instanceof Error ? e.message : String(e)), "error");

/** Asks the user to confirm in an in-app dialog; resolves false on cancel. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useUi.getState().confirm?.resolve(false);
    useUi.setState({
      confirm: {
        ...opts,
        resolve: (ok) => {
          useUi.setState({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}
