// Offers a newer release: its changelog, then download progress and restart.
import { useEffect } from "react";
import { Download } from "lucide-react";
import { Button, Modal } from "../ui";
import { changelog, installUpdate, scheduleUpdateCheck, useUpdate } from "../../lib/updater";
import { useT } from "../../i18n";
import { notifyError } from "../../store/ui";
import { formatMB } from "../../lib/format";

export function UpdateDialog() {
  const t = useT();
  const update = useUpdate((s) => s.update);
  const progress = useUpdate((s) => s.progress);
  const dismiss = useUpdate((s) => s.dismiss);

  useEffect(() => scheduleUpdateCheck(), []);

  if (!update) return null;
  const notes = changelog(update.body);
  const ratio = progress?.total ? Math.min(1, progress.done / progress.total) : null;
  return (
    <Modal title={t("update.title", { version: update.version })} onClose={() => !progress && dismiss()} width={520}>
      <p className="text-[12px] text-muted">{t("update.body", { version: update.version, current: update.currentVersion })}</p>
      {notes && (
        <pre className="mt-3 max-h-64 overflow-y-auto rounded-md border border-line bg-bg px-3 py-2 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-text">
          {notes}
        </pre>
      )}
      {progress && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded bg-panel-2">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${(ratio ?? 0.05) * 100}%` }} />
          </div>
          <div className="mt-1.5 text-[11px] text-muted">
            {t("update.downloading", { done: formatMB(progress.done), total: progress.total ? formatMB(progress.total) : "…" })}
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" disabled={!!progress} onClick={dismiss}>{t("update.later")}</Button>
        <Button variant="primary" disabled={!!progress} onClick={() => installUpdate().catch(notifyError)}>
          <Download size={13} /> {t("update.install")}
        </Button>
      </div>
    </Modal>
  );
}
