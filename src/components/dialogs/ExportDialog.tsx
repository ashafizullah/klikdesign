import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useDesign } from "../../store/design";
import { notifyError, useUi } from "../../store/ui";
import { exportDesign, type ExportFormat } from "../../lib/export";
import { useT, type Key } from "../../i18n";
import { Button, Modal } from "../ui";

const FORMATS: { id: ExportFormat; label: string; hint: Key }[] = [
  { id: "png", label: "PNG", hint: "export.pngHint" },
  { id: "jpg", label: "JPG", hint: "export.jpgHint" },
  { id: "pdf", label: "PDF", hint: "export.pdfHint" },
  { id: "svg", label: "SVG", hint: "export.svgHint" },
];

export function ExportDialog() {
  const t = useT();
  const close = () => useUi.getState().open(null);
  const { width, height } = useDesign((s) => s.design);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const scalable = format !== "svg";

  const run = async () => {
    setBusy(true);
    try {
      // Deselect first so nothing UI-only is mid-edit while rendering.
      useDesign.getState().select([]);
      const path = await exportDesign(format, scalable ? scale : 1);
      if (!path) return;
      close();
      useUi.getState().notify(t("export.done", { path }));
      void revealItemInDir(path).catch(() => {});
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("export.title")} onClose={close} width={460}>
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`rounded-lg border py-3 text-[13px] font-semibold ${format === f.id ? "border-accent bg-accent/10 text-accent" : "border-line hover:border-muted"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted">{t(FORMATS.find((f) => f.id === format)!.hint)}</p>
        {scalable && (
          <div>
            <span className="label">{t("export.scale")}</span>
            <div className="flex gap-2">
              {[0.5, 1, 2, 3].map((s) => (
                <button
                  key={s}
                  onClick={() => setScale(s)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[12px] ${scale === s ? "border-accent text-accent" : "border-line text-muted hover:text-text"}`}
                >
                  {s}× <span className="block text-[10px] opacity-70">{Math.round(width * s)}×{Math.round(height * s)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={busy} onClick={run}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {t("export.download")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
