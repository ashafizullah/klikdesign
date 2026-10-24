// Version history of the open design: save a named version, look through
// earlier ones and restore one (undoable, and the current state is kept as a
// version first).
import { useEffect, useState } from "react";
import { BookmarkPlus, Bot, FolderOpen, History, Loader2, RotateCcw, Save, Trash2, type LucideIcon } from "lucide-react";
import { useDesign } from "../../store/design";
import { useChat } from "../../store/chat";
import { notifyError, useUi } from "../../store/ui";
import { ipc } from "../../lib/ipc";
import { deleteVersion, restoreVersion, snapshot, useVersions, type VersionKind, type VersionMeta } from "../../lib/versions";
import { shortcut } from "../../lib/platform";
import { useLocale, useT } from "../../i18n";
import { Button, IconButton, Modal } from "../ui";

const KIND_ICONS: Record<VersionKind, LucideIcon> = { manual: BookmarkPlus, open: FolderOpen, ai: Bot, auto: Save, restore: RotateCcw };

/** "5 minutes ago" in the app's language. */
export function ago(at: number, locale: string, now = Date.now()): string {
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const s = Math.round((at - now) / 1000);
  for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(s) >= size) return fmt.format(Math.round(s / size), unit);
  }
  return fmt.format(0, "second");
}

export function HistoryDialog() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const close = () => useUi.getState().open(null);
  const designId = useDesign((s) => s.design.id);
  const changed = useVersions((s) => s.version);
  const [list, setList] = useState<VersionMeta[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Restoring while the AI edits would mix its changes into the restored version.
  const aiBusy = useChat((s) => s.busy);

  useEffect(() => {
    ipc.versions(designId).then((l) => {
      setList(l);
      setPicked((p) => (p && l.some((v) => v.id === p) ? p : (l[0]?.id ?? null)));
    }, notifyError);
  }, [designId, changed]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  const title = (v: VersionMeta) =>
    v.kind === "manual" ? v.label || t("history.kind.manual") : v.kind === "ai" && v.label ? t("history.beforeAi", { prompt: v.label }) : t(`history.kind.${v.kind}`);
  const cur = list?.find((v) => v.id === picked);

  return (
    <Modal title={t("history.title")} onClose={close} width={860}>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await snapshot("manual", name);
            setName("");
          });
        }}
      >
        <input className="field flex-1" placeholder={t("history.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="primary" disabled={busy}>
          <BookmarkPlus size={14} /> {t("history.save")}
        </Button>
      </form>
      {!list ? (
        <div className="flex h-60 items-center justify-center text-muted"><Loader2 size={18} className="animate-spin" /></div>
      ) : !list.length ? (
        <div className="flex h-60 flex-col items-center justify-center gap-2 text-center text-[12px] text-muted">
          <History size={22} />
          <p className="max-w-80">{t("history.empty")}</p>
        </div>
      ) : (
        <div className="grid h-[56vh] grid-cols-[300px_1fr] gap-4">
          <div className="-mr-1 flex flex-col gap-1 overflow-y-auto pr-1">
            {list.map((v) => {
              const Icon = KIND_ICONS[v.kind] ?? Save;
              return (
                <button
                  key={v.id}
                  onClick={() => setPicked(v.id)}
                  className={`flex items-center gap-2.5 rounded-md border p-1.5 text-left ${v.id === picked ? "border-accent/60 bg-accent/10" : "border-transparent hover:bg-panel-2"}`}
                >
                  <div className="checker-soft flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded">
                    {v.thumb ? <img src={v.thumb} alt="" className="max-h-full max-w-full" draggable={false} /> : <Icon size={16} className="text-muted" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <Icon size={12} className={`shrink-0 ${v.kind === "manual" ? "text-accent" : "text-muted"}`} />
                      <span className="truncate">{title(v)}</span>
                    </div>
                    <div className="text-[11px] text-muted" title={new Date(v.at).toLocaleString(locale)}>
                      {ago(v.at, locale)}
                      {v.pages > 1 && ` · ${t("history.pages", { n: v.pages })}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {cur && (
            <div className="flex min-h-0 flex-col gap-3">
              <div className="checker-soft flex min-h-0 flex-1 items-center justify-center rounded-lg border border-line p-4">
                {cur.thumb ? (
                  <img src={cur.thumb} alt="" className="max-h-full max-w-full shadow-lg" draggable={false} />
                ) : (
                  <span className="text-[12px] text-muted">{t("history.noPreview")}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{title(cur)}</div>
                  <div className="text-[11px] text-muted">{new Date(cur.at).toLocaleString(locale)}</div>
                </div>
                <IconButton title={t("common.delete")} className="hover:text-danger" disabled={busy} onClick={() => void run(() => deleteVersion(cur.id))}>
                  <Trash2 size={15} />
                </IconButton>
                <Button
                  variant="primary"
                  disabled={busy || aiBusy}
                  title={aiBusy ? t("history.aiBusy") : undefined}
                  onClick={() =>
                    void run(async () => {
                      await restoreVersion(cur.id);
                      close();
                      useUi.getState().notify(t("history.restored", { when: ago(cur.at, locale), undo: shortcut("Z") }));
                    })
                  }
                >
                  <RotateCcw size={14} /> {t("history.restore")}
                </Button>
              </div>
              {cur.pages > 1 && <p className="text-[11px] text-muted">{t("history.pagesHint", { n: cur.pages })}</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
