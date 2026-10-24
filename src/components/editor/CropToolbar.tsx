// Controls pinned to the top of the canvas while an image is being cropped.
import { Check, RotateCcw, ZoomIn } from "lucide-react";
import type { ImageEl } from "../../types/design";
import { useDesign } from "../../store/design";
import { useUi } from "../../store/ui";
import { useT } from "../../i18n";
import { Button, IconButton } from "../ui";
import { setCrop } from "./Canvas";

export function CropToolbar({ el }: { el: ImageEl }) {
  const t = useT();
  const c = el.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
  return (
    <div
      className="absolute top-2 left-1/2 z-20 flex h-10 -translate-x-1/2 items-center gap-2 rounded-lg border border-line bg-panel/95 py-1 pr-1 pl-3 shadow-xl backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="text-[11px] whitespace-nowrap text-muted">{t("crop.hint")}</span>
      <div className="mx-1 h-5 w-px bg-line" />
      <ZoomIn size={14} className="shrink-0 text-muted" />
      <input
        type="range"
        title={t("crop.zoom")}
        className="w-28 accent-[var(--color-accent)]"
        min={1}
        max={5}
        step={0.01}
        value={c.zoom}
        onChange={(e) => setCrop(el, { ...c, zoom: Number(e.target.value) })}
      />
      <IconButton title={t("crop.reset")} disabled={!el.crop} onClick={() => useDesign.getState().patch(el.id, { crop: undefined })}>
        <RotateCcw size={14} />
      </IconButton>
      <Button variant="primary" className="h-8 px-2.5" onClick={() => useUi.getState().setCropping(null)}>
        <Check size={14} /> {t("crop.done")}
      </Button>
    </div>
  );
}
