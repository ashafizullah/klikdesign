// Magic resize: pick a format, then fit the design to it (as a copy or in place) and let the AI re-lay it out.
import { useEffect, useState } from "react";
import { Loader2, Scaling } from "lucide-react";
import { SIZE_PRESETS } from "../../types/design";
import { useDesign } from "../../store/design";
import { aiReady } from "../../store/settings";
import { notifyError, useUi } from "../../store/ui";
import { magicResize } from "../../lib/magicResize";
import { useT } from "../../i18n";
import { Button, Modal, NumberField } from "../ui";
import { SizeTiles } from "../ui/SizeTiles";

export function ResizeDialog() {
  const t = useT();
  const close = () => useUi.getState().open(null);
  const cur = useDesign((s) => s.design);
  const first = SIZE_PRESETS.find((p) => p.width !== cur.width || p.height !== cur.height) ?? SIZE_PRESETS[0];
  const [preset, setPreset] = useState<string | null>(first.id);
  const [size, setSize] = useState({ w: first.width, h: first.height });
  const [copy, setCopy] = useState(true);
  const [ready, setReady] = useState(false);
  const [ai, setAi] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => void aiReady().then(setReady), []);

  const pick = (id: string) => {
    const p = SIZE_PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setSize({ w: p.width, h: p.height });
  };
  const custom = (w: number, h: number) => {
    setSize({ w, h });
    setPreset(SIZE_PRESETS.find((p) => p.width === w && p.height === h)?.id ?? null);
  };
  const same = size.w === cur.width && size.h === cur.height;

  const run = async () => {
    setBusy(true);
    try {
      const label = preset ? t(`size.${preset}` as "size.custom") : `${size.w}×${size.h}`;
      await magicResize({ width: size.w, height: size.h, label, copy, ai: ai && ready });
      close();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("resize.title")} onClose={close} width={640}>
      <div className="space-y-4">
        <p className="text-[12px] text-muted">{t("resize.body", { size: `${cur.width}×${cur.height}` })}</p>
        <SizeTiles className="grid-cols-4" value={preset} onChange={pick} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t("insp.width")} value={size.w} step={1} min={16} max={10000} onChange={(w) => custom(Math.round(w), size.h)} suffix="px" />
          <NumberField label={t("insp.height")} value={size.h} step={1} min={16} max={10000} onChange={(h) => custom(size.w, Math.round(h))} suffix="px" />
        </div>
        <div className="space-y-2 rounded-lg border border-line p-3 text-[12px]">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
            <span>
              {t("resize.copy")}
              <span className="block text-[11px] text-muted">{t(copy ? "resize.copyHint" : "resize.inPlaceHint")}</span>
            </span>
          </label>
          <label className={`flex items-start gap-2 ${ready ? "" : "opacity-50"}`}>
            <input type="checkbox" className="mt-0.5" disabled={!ready} checked={ai && ready} onChange={(e) => setAi(e.target.checked)} />
            <span>
              {t("resize.ai")}
              <span className="block text-[11px] text-muted">{t(ready ? "resize.aiHint" : "resize.aiNoKey")}</span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={busy || same} onClick={run}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Scaling size={13} />} {t("resize.run")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
