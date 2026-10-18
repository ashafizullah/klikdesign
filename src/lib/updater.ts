// Self-update from GitHub Releases. The release workflow publishes a signed
// latest.json; the updater only installs packages signed with our key.
import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const LAST_CHECK = "klikdesign-update-checked";
const DAY = 24 * 60 * 60 * 1000;

interface UpdateState {
  update: Update | null;
  checking: boolean;
  /** Bytes downloaded / total while installing; null when idle. */
  progress: { done: number; total?: number } | null;
  dismiss(): void;
}

export const useUpdate = create<UpdateState>()((set) => ({
  update: null,
  checking: false,
  progress: null,
  dismiss: () => set({ update: null }),
}));

/** The changelog part of the release notes: everything before "## Download". */
export function changelog(notes: string | undefined): string {
  const lines = (notes ?? "").split("\n");
  const end = lines.findIndex((l) => l.trimStart().startsWith("## Download"));
  return (end < 0 ? lines : lines.slice(0, end)).join("\n").trim();
}

/** Looks for a newer release; opens the update dialog when one exists. */
export async function checkForUpdate(): Promise<Update | null> {
  if (useUpdate.getState().checking) return null;
  useUpdate.setState({ checking: true });
  try {
    const update = await check();
    try {
      localStorage.setItem(LAST_CHECK, String(Date.now()));
    } catch {
      /* storage unavailable: check again next launch */
    }
    if (update) useUpdate.setState({ update });
    return update;
  } finally {
    useUpdate.setState({ checking: false });
  }
}

/** Quiet check shortly after launch, at most once a day. */
export function scheduleUpdateCheck(): () => void {
  if (import.meta.env.DEV || !("__TAURI_INTERNALS__" in window)) return () => {};
  let last = 0;
  try {
    last = Number(localStorage.getItem(LAST_CHECK)) || 0;
  } catch {
    /* ignore */
  }
  if (Date.now() - last < DAY) return () => {};
  const timer = setTimeout(() => void checkForUpdate().catch(() => {}), 8000);
  return () => clearTimeout(timer);
}

/** Downloads and installs the pending update, then restarts the app. */
export async function installUpdate(): Promise<void> {
  const update = useUpdate.getState().update;
  if (!update) return;
  let done = 0;
  useUpdate.setState({ progress: { done: 0 } });
  try {
    await update.downloadAndInstall((e) => {
      if (e.event === "Started") useUpdate.setState({ progress: { done: 0, total: e.data.contentLength } });
      else if (e.event === "Progress") {
        done += e.data.chunkLength;
        useUpdate.setState((s) => ({ progress: { done, total: s.progress?.total } }));
      }
    });
    await relaunch();
  } catch (e) {
    useUpdate.setState({ progress: null });
    throw e;
  }
}
