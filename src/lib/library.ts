// Design persistence in the app library, with autosave.
import type { Design } from "../types/design";
import { emptyDesign, normalizeDesign, useDesign } from "../store/design";
import { useApp } from "../store/app";
import { useChat } from "../store/chat";
import { notifyError, useUi } from "../store/ui";
import { ipc } from "./ipc";
import { renderPage, stageReady } from "./stage";
import { ensureFonts } from "./fonts";
import { t } from "../i18n";

function thumbnail(d: Design): string | undefined {
  if (!stageReady()) return undefined;
  try {
    return renderPage(320 / Math.max(d.width, d.height));
  } catch {
    return undefined;
  }
}

let lastThumb: string | undefined;

export async function saveNow(): Promise<void> {
  const { design } = useDesign.getState();
  lastThumb = thumbnail(design) ?? lastThumb;
  await ipc.designStore(design.id, JSON.stringify({ ...design, thumb: lastThumb }));
  if (useDesign.getState().design === design) useDesign.getState().markSaved();
}

let timer: ReturnType<typeof setTimeout> | undefined;
useDesign.subscribe((s, prev) => {
  if (s.design === prev.design || !s.dirty || useApp.getState().view !== "editor") return;
  clearTimeout(timer);
  timer = setTimeout(() => saveNow().catch(notifyError), 800);
});

function enter(design: Design) {
  lastThumb = undefined;
  useChat.getState().reset();
  useUi.getState().setZoom(null);
  useUi.getState().setEditingText(null);
  useDesign.getState().load(design);
  useDesign.temporal.getState().clear();
  void ensureFonts(design.elements.flatMap((e) => (e.type === "text" ? [e.fontFamily] : [])));
  useApp.getState().openEditor();
}

export async function createDesign(over: Partial<Design> = {}): Promise<void> {
  const design = normalizeDesign({ ...emptyDesign({ name: t("home.untitled") }), ...over });
  enter(design);
  await saveNow();
}

export async function openDesign(id: string) {
  try {
    const { thumb, ...rest } = JSON.parse(await ipc.designFetch(id)) as Design & { thumb?: string };
    enter(normalizeDesign(rest));
    lastThumb = thumb;
  } catch (e) {
    notifyError(e);
  }
}

export async function closeDesign() {
  // The AI writes into whichever design is open, so leaving mid-job would corrupt the next one.
  if (useChat.getState().busy) {
    useUi.getState().notify(t("top.backBusy"), "error");
    return;
  }
  clearTimeout(timer);
  // Always save on leave so the thumbnail reflects the final state.
  await saveNow().catch(notifyError);
  useApp.getState().goHome();
}
