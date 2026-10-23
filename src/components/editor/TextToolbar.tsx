// Quick text controls pinned to the top of the canvas while one text element is selected.
import { AlignCenter, AlignLeft, AlignRight, Bold, CaseUpper, Italic, SlidersHorizontal } from "lucide-react";
import type { TextEl } from "../../types/design";
import { isGradient } from "../../types/design";
import { useDesign } from "../../store/design";
import { useUi } from "../../store/ui";
import { fontInfo, nearestWeight } from "../../lib/fonts";
import { useT } from "../../i18n";
import { IconButton, NumberField } from "../ui";
import { FontPicker } from "../ui/FontPicker";
import { fontPatch } from "./Inspector";

const ALIGNS = ["left", "center", "right"] as const;
const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight };

export function TextToolbar({ el }: { el: TextEl }) {
  const t = useT();
  const p = (x: Partial<TextEl>) => useDesign.getState().patch(el.id, x);
  const AlignIcon = ALIGN_ICONS[el.align];
  const nextAlign = ALIGNS[(ALIGNS.indexOf(el.align) + 1) % ALIGNS.length];

  return (
    <div
      className="absolute top-2 left-1/2 z-20 flex h-10 -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-panel/95 p-1 shadow-xl backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <FontPicker className="w-40" value={el.fontFamily} onChange={(family) => p(fontPatch(el, family))} />
      <div className="w-[72px]">
        <NumberField value={el.fontSize} step={1} min={4} max={2000} onChange={(fontSize) => p({ fontSize })} suffix="px" />
      </div>
      <label
        title={t("insp.color")}
        className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line"
        style={{ background: isGradient(el.fill) ? `linear-gradient(${el.fill.angle}deg, ${el.fill.colors.join(", ")})` : el.fill }}
        onClick={(e) => {
          // Gradients are edited in the Design panel.
          if (isGradient(el.fill)) {
            e.preventDefault();
            useUi.getState().setRightTab("design");
          }
        }}
      >
        {!isGradient(el.fill) && (
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={/^#[0-9a-f]{6}$/i.test(el.fill) ? el.fill : "#000000"}
            onChange={(e) => p({ fill: e.target.value })}
          />
        )}
      </label>
      <div className="mx-0.5 h-5 w-px bg-line" />
      <IconButton title={t("insp.bold")} active={el.fontWeight >= 700} onClick={() => p({ fontWeight: nearestWeight(el.fontFamily, el.fontWeight >= 700 ? 400 : 700) })}><Bold size={15} /></IconButton>
      <IconButton title={t("insp.italic")} active={!!el.italic} disabled={!fontInfo(el.fontFamily)?.italic} onClick={() => p({ italic: el.italic ? undefined : true })}><Italic size={15} /></IconButton>
      <IconButton title={t("insp.uppercase")} active={!!el.uppercase} onClick={() => p({ uppercase: el.uppercase ? undefined : true })}><CaseUpper size={15} /></IconButton>
      <IconButton title={t(`insp.${nextAlign}`)} onClick={() => p({ align: nextAlign })}><AlignIcon size={15} /></IconButton>
      <div className="mx-0.5 h-5 w-px bg-line" />
      <IconButton title={t("insp.more")} onClick={() => useUi.getState().setRightTab("design")}><SlidersHorizontal size={15} /></IconButton>
    </div>
  );
}
