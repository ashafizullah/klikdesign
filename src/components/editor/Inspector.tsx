// Properties of the selection, or of the page when nothing is selected.
import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignLeft, AlignRight,
  AlignHorizontalSpaceAround, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround, ArrowDownToLine, ArrowUpToLine, Bold, CaseUpper,
  ChevronDown, ChevronUp, Copy, Crop, Group, Italic, Lock, RotateCcw, Trash2, Ungroup, Unlock,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useState } from "react";
import type { Adjust, El, Fill, IconEl, ImageEl, Mask, QrEl, ShapeEl, Shadow, TextEl } from "../../types/design";
import { MASKS, SIZE_PRESETS, isGradient, solidOf } from "../../types/design";
import { maskPath } from "../../lib/geometry";
import { parseWaLink, qrPath, waLink } from "../../lib/qr";
import { useDesign } from "../../store/design";
import { useUi } from "../../store/ui";
import { ensureFont, fontInfo, nearestWeight } from "../../lib/fonts";
import { FontPicker } from "../ui/FontPicker";
import { useBrandKit } from "../../store/brand";
import { bounds, textHeight } from "../../lib/geometry";
import { alignOffset, distributeOffsets, union, type AlignMode } from "../../lib/arrange";
import { isOneGroup, units } from "../../lib/groups";
import { shortcut } from "../../lib/platform";
import { textLines } from "../../lib/stage";
import { useT } from "../../i18n";
import { Button, IconButton, NumberField, Section, Slider } from "../ui";

export function Inspector() {
  const t = useT();
  const sel = useDesign(useShallow((s) => s.design.elements.filter((e) => s.selected.includes(e.id))));
  if (sel.length === 0) return <PageProps />;
  const one = sel.length === 1 ? sel[0] : null;
  return (
    <div>
      <Arrange sel={sel} />
      {one?.type === "text" && <TextProps el={one} />}
      {one?.type === "shape" && <ShapeProps el={one} />}
      {one?.type === "image" && <ImageProps el={one} />}
      {one?.type === "icon" && <IconProps el={one} />}
      {one?.type === "qr" && <QrProps el={one} />}
      {one && <Geometry el={one} />}
      <Section title={t("insp.effects")}>
        <Slider label={t("insp.opacity")} min={0} max={1} value={one?.opacity ?? 1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patchAll(sel, { opacity: v })} />
        {one && <ShadowProps el={one} />}
      </Section>
    </div>
  );
}

const patch = (id: string, p: Partial<El>) => useDesign.getState().patch(id, p);
const patchAll = (els: El[], p: Partial<El>) => useDesign.getState().patchMany(els.map((e) => ({ id: e.id, patch: p })));

function PageProps() {
  const t = useT();
  const design = useDesign((s) => s.design);
  const update = useDesign((s) => s.update);
  const preset = SIZE_PRESETS.find((p) => p.width === design.width && p.height === design.height)?.id ?? "";
  const resize = (width: number, height: number) => {
    update((d) => Object.assign(d, { width: Math.round(width), height: Math.round(height) }));
    useUi.getState().setZoom(null);
  };
  return (
    <div>
      <Section title={t("insp.page")}>
        <label className="block">
          <span className="label">{t("insp.size")}</span>
          <select className="field" value={preset} onChange={(e) => { const p = SIZE_PRESETS.find((x) => x.id === e.target.value); if (p) resize(p.width, p.height); }}>
            <option value="">{t("size.custom")}</option>
            {SIZE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{t(`size.${p.id}` as "size.custom")} · {p.width}×{p.height}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t("insp.width")} value={design.width} step={1} min={16} max={10000} onChange={(v) => resize(v, design.height)} suffix="px" />
          <NumberField label={t("insp.height")} value={design.height} step={1} min={16} max={10000} onChange={(v) => resize(design.width, v)} suffix="px" />
        </div>
      </Section>
      <Section title={t("insp.background")}>
        <FillEditor value={design.background} onChange={(f) => update((d) => void (d.background = f))} />
      </Section>
      <p className="px-3 py-3 text-[11px] leading-relaxed text-muted">{t("insp.hint")}</p>
    </div>
  );
}

function Arrange({ sel }: { sel: El[] }) {
  const t = useT();
  const store = useDesign.getState();
  const ids = sel.map((e) => e.id);
  const locked = sel.every((e) => e.locked);
  const elements = useDesign((s) => s.design.elements);
  const oneGroup = isOneGroup(elements, ids);
  const grouped = sel.some((e) => e.groupId);
  const unitCount = units(elements, ids).length;

  /** Each group and each ungrouped element of the selection, with its bounds. */
  const measure = () => {
    const lines = textLines();
    // Text boxes use the measured height; the stored one is not kept up to date.
    const box = (e: El) => bounds(e.type === "text" ? { ...e, h: textHeight(lines[e.id]?.length ?? 1, e.fontSize, e.lineHeight) } : e);
    return units(useDesign.getState().design.elements, ids).map((u) => ({ u, b: union(u.map(box)) }));
  };
  const move = (moves: { u: El[]; dx: number; dy: number }[]) =>
    store.patchMany(moves.flatMap(({ u, dx, dy }) => u.filter((e) => !e.locked).map((e) => ({ id: e.id, patch: { x: e.x + dx, y: e.y + dy } }))));
  const align = (mode: AlignMode) => {
    const { design } = useDesign.getState();
    const boxes = measure();
    // One element or group aligns to the page; several align to their shared bounds.
    const area = boxes.length === 1 ? { x: 0, y: 0, w: design.width, h: design.height } : union(boxes.map(({ b }) => b));
    move(boxes.map(({ u, b }) => ({ u, ...alignOffset(b, area, mode) })));
  };
  const distribute = (axis: "x" | "y") => {
    const boxes = measure();
    const offsets = distributeOffsets(boxes.map(({ b }) => b), axis);
    move(boxes.map(({ u }, i) => ({ u, ...offsets[i] })));
  };
  return (
    <Section title={oneGroup ? `${sel[0].groupName || t("layers.group")} · ${t("insp.groupCount", { n: sel.length })}` : sel.length > 1 ? t("insp.selected", { n: sel.length }) : t(`type.${sel[0].type}`)}>
      <div className="flex flex-wrap gap-0.5">
        <IconButton title={t("insp.alignLeft")} onClick={() => align("l")}><AlignStartVertical size={15} /></IconButton>
        <IconButton title={t("insp.alignCenter")} onClick={() => align("c")}><AlignCenterVertical size={15} /></IconButton>
        <IconButton title={t("insp.alignRight")} onClick={() => align("r")}><AlignEndVertical size={15} /></IconButton>
        <IconButton title={t("insp.alignTop")} onClick={() => align("t")}><AlignStartHorizontal size={15} /></IconButton>
        <IconButton title={t("insp.alignMiddle")} onClick={() => align("m")}><AlignCenterHorizontal size={15} /></IconButton>
        <IconButton title={t("insp.alignBottom")} onClick={() => align("b")}><AlignEndHorizontal size={15} /></IconButton>
        {sel.length > 1 && (
          <>
            <div className="mx-0.5 w-px bg-line" />
            <IconButton title={t("insp.distributeH")} disabled={unitCount < 3} onClick={() => distribute("x")}><AlignHorizontalSpaceAround size={15} /></IconButton>
            <IconButton title={t("insp.distributeV")} disabled={unitCount < 3} onClick={() => distribute("y")}><AlignVerticalSpaceAround size={15} /></IconButton>
          </>
        )}
      </div>
      {(grouped || sel.length > 1) && (
        <div className="flex gap-1.5">
          {sel.length > 1 && !oneGroup && (
            <Button className="flex-1" onClick={() => store.group(ids)} title={`${t("insp.groupAction")} (${shortcut("G")})`}>
              <Group size={14} /> {t("insp.groupAction")}
            </Button>
          )}
          {grouped && (
            <Button className="flex-1" onClick={() => store.ungroup(ids)} title={`${t("insp.ungroup")} (${shortcut("G", true)})`}>
              <Ungroup size={14} /> {t("insp.ungroup")}
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-0.5">
        <IconButton title={t("insp.toFront")} onClick={() => store.reorder(ids, "front")}><ArrowUpToLine size={15} /></IconButton>
        <IconButton title={t("insp.forward")} onClick={() => store.reorder(ids, "forward")}><ChevronUp size={15} /></IconButton>
        <IconButton title={t("insp.backward")} onClick={() => store.reorder(ids, "backward")}><ChevronDown size={15} /></IconButton>
        <IconButton title={t("insp.toBack")} onClick={() => store.reorder(ids, "back")}><ArrowDownToLine size={15} /></IconButton>
        <div className="flex-1" />
        <IconButton title={t(locked ? "insp.unlock" : "insp.lock")} onClick={() => patchAll(sel, { locked: locked ? undefined : true })}>
          {locked ? <Lock size={15} /> : <Unlock size={15} />}
        </IconButton>
        <IconButton title={t("insp.duplicate")} onClick={() => store.duplicate(ids)}><Copy size={15} /></IconButton>
        <IconButton title={t("common.delete")} className="hover:text-danger" onClick={() => store.remove(ids)}><Trash2 size={15} /></IconButton>
      </div>
    </Section>
  );
}

function Geometry({ el }: { el: El }) {
  const t = useT();
  const r = (v: number) => Math.round(v);
  return (
    <Section title={t("insp.position")}>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={r(el.x)} step={1} onChange={(x) => patch(el.id, { x })} />
        <NumberField label="Y" value={r(el.y)} step={1} onChange={(y) => patch(el.id, { y })} />
        <NumberField label={t("insp.width")} value={r(el.w)} step={1} min={1} onChange={(w) => patch(el.id, { w })} />
        {el.type !== "text" && <NumberField label={t("insp.height")} value={r(el.h)} step={1} min={1} onChange={(h) => patch(el.id, { h })} />}
        <NumberField label={t("insp.rotation")} value={el.rotation} step={1} suffix="°" onChange={(rotation) => patch(el.id, { rotation })} />
      </div>
    </Section>
  );
}

function TextProps({ el }: { el: TextEl }) {
  const t = useT();
  const p = (x: Partial<TextEl>) => patch(el.id, x);
  const weights = fontInfo(el.fontFamily)?.weights ?? [400, 700];
  return (
    <Section title={t("insp.text")}>
      <textarea className="field min-h-16 resize-y" value={el.text} onChange={(e) => p({ text: e.target.value })} />
      <FontPicker value={el.fontFamily} onChange={(family) => p(fontPatch(el, family))} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label={t("insp.fontSize")} value={el.fontSize} step={1} min={4} max={2000} onChange={(fontSize) => p({ fontSize })} suffix="px" />
        <label className="block">
          <span className="label">{t("insp.weight")}</span>
          <select className="field" value={el.fontWeight} onChange={(e) => p({ fontWeight: Number(e.target.value) })}>
            {weights.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-0.5">
        <IconButton title={t("insp.bold")} active={el.fontWeight >= 700} onClick={() => p({ fontWeight: nearestWeight(el.fontFamily, el.fontWeight >= 700 ? 400 : 700) })}><Bold size={15} /></IconButton>
        <IconButton title={t("insp.italic")} active={!!el.italic} disabled={!fontInfo(el.fontFamily)?.italic} onClick={() => p({ italic: el.italic ? undefined : true })}><Italic size={15} /></IconButton>
        <IconButton title={t("insp.uppercase")} active={!!el.uppercase} onClick={() => p({ uppercase: el.uppercase ? undefined : true })}><CaseUpper size={15} /></IconButton>
        <div className="mx-1 w-px bg-line" />
        <IconButton title={t("insp.left")} active={el.align === "left"} onClick={() => p({ align: "left" })}><AlignLeft size={15} /></IconButton>
        <IconButton title={t("insp.center")} active={el.align === "center"} onClick={() => p({ align: "center" })}><AlignCenter size={15} /></IconButton>
        <IconButton title={t("insp.right")} active={el.align === "right"} onClick={() => p({ align: "right" })}><AlignRight size={15} /></IconButton>
      </div>
      <Slider label={t("insp.lineHeight")} min={0.6} max={3} step={0.05} value={el.lineHeight} onChange={(lineHeight) => p({ lineHeight })} />
      <Slider label={t("insp.letterSpacing")} min={-10} max={60} step={0.5} value={el.letterSpacing} onChange={(letterSpacing) => p({ letterSpacing })} />
      <span className="label">{t("insp.color")}</span>
      <FillEditor value={el.fill} onChange={(fill) => p({ fill })} />
      <StrokeProps stroke={el.stroke} width={el.strokeWidth} onChange={(stroke, strokeWidth) => p({ stroke, strokeWidth })} />
    </Section>
  );
}

/** Switches a text element's font, keeping the closest weight and italic the family has. */
export function fontPatch(el: TextEl, family: string): Partial<TextEl> {
  void ensureFont(family);
  return { fontFamily: family, fontWeight: nearestWeight(family, el.fontWeight), italic: fontInfo(family)?.italic ? el.italic : undefined };
}

function ShapeProps({ el }: { el: ShapeEl }) {
  const t = useT();
  const p = (x: Partial<ShapeEl>) => patch(el.id, x);
  return (
    <Section title={t("insp.shape")}>
      {el.shape !== "line" && (
        <>
          <span className="label">{t("insp.fill")}</span>
          <FillEditor value={el.fill} onChange={(fill) => p({ fill })} />
        </>
      )}
      {el.shape === "rect" && <Slider label={t("insp.radius")} min={0} max={Math.min(el.w, el.h) / 2} step={1} value={el.cornerRadius ?? 0} format={(v) => `${Math.round(v)}px`} onChange={(cornerRadius) => p({ cornerRadius })} />}
      <StrokeProps stroke={el.stroke} width={el.strokeWidth} required={el.shape === "line"} onChange={(stroke, strokeWidth) => p({ stroke, strokeWidth })} />
    </Section>
  );
}

function ImageProps({ el }: { el: ImageEl }) {
  const t = useT();
  const cropping = useUi((s) => s.croppingId === el.id);
  const crop = el.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
  return (
    <Section title={t("type.image")}>
      <div className="flex gap-1.5">
        <Button className="flex-1" variant={cropping ? "primary" : "subtle"} disabled={el.locked} onClick={() => useUi.getState().setCropping(cropping ? null : el.id)} title={t("crop.title")}>
          <Crop size={14} /> {t(cropping ? "crop.done" : "crop.action")}
        </Button>
        <IconButton title={t("crop.reset")} disabled={!el.crop} onClick={() => patch(el.id, { crop: undefined })}><RotateCcw size={15} /></IconButton>
      </div>
      <Slider label={t("crop.zoom")} min={1} max={5} step={0.01} value={crop.zoom} format={(v) => `${Math.round(v * 100)}%`} onChange={(zoom) => patch(el.id, { crop: { ...crop, zoom } })} />
      {!el.mask && <Slider label={t("insp.radius")} min={0} max={Math.min(el.w, el.h) / 2} step={1} value={el.cornerRadius ?? 0} format={(v) => `${Math.round(v)}px`} onChange={(cornerRadius) => patch(el.id, { cornerRadius: cornerRadius || undefined })} />}
      <span className="label">{t("frame.title")}</span>
      <FramePicker value={el.mask} onChange={(mask) => patch(el.id, { mask })} />
      <AdjustProps el={el} />
    </Section>
  );
}

/** Frame shapes as small tiles; the first one removes the frame. */
export function FramePicker({ value, onChange, disabled }: { value?: Mask; onChange(m: Mask | undefined): void; disabled?: boolean }) {
  const t = useT();
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {[undefined, ...MASKS].map((m) => (
        <button
          key={m ?? "none"}
          disabled={disabled}
          title={t(`frame.${m ?? "none"}`)}
          onClick={() => onChange(m)}
          className={`flex aspect-square items-center justify-center rounded-md border p-1.5 disabled:opacity-40 ${value === m ? "border-accent bg-accent/10" : "border-line bg-panel-2 hover:border-muted"}`}
        >
          <svg viewBox="0 0 40 40" className="h-full w-full">
            {m ? <path d={maskPath(m, 40, 40)} className="fill-muted/70" /> : <rect x="2" y="2" width="36" height="36" rx="3" className="fill-none stroke-muted" strokeDasharray="4 3" />}
          </svg>
        </button>
      ))}
    </div>
  );
}

function AdjustProps({ el }: { el: ImageEl }) {
  const t = useT();
  const a = el.adjust ?? { brightness: 0, contrast: 0, saturation: 0 };
  const set = (x: Partial<Adjust>) => {
    const next = { ...a, ...x };
    patch(el.id, { adjust: next.brightness || next.contrast || next.saturation ? next : undefined });
  };
  const o = el.overlay;
  const signed = (v: number) => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v)));
  return (
    <>
      <div className="flex items-center justify-between pt-1">
        <span className="label mb-0">{t("adjust.title")}</span>
        <button className="text-[11px] text-muted hover:text-text disabled:opacity-40" disabled={!el.adjust} onClick={() => patch(el.id, { adjust: undefined })}>{t("adjust.reset")}</button>
      </div>
      <Slider label={t("adjust.brightness")} min={-100} max={100} step={1} value={a.brightness} format={signed} onChange={(brightness) => set({ brightness })} />
      <Slider label={t("adjust.contrast")} min={-100} max={100} step={1} value={a.contrast} format={signed} onChange={(contrast) => set({ contrast })} />
      <Slider label={t("adjust.saturation")} min={-100} max={100} step={1} value={a.saturation} format={signed} onChange={(saturation) => set({ saturation })} />
      <Button className="w-full" onClick={() => set({ saturation: a.saturation === -100 ? 0 : -100 })}>
        {t(a.saturation === -100 ? "adjust.color" : "adjust.bw")}
      </Button>
      <label className="flex items-center justify-between pt-1">
        <span className="label mb-0">{t("adjust.overlay")}</span>
        <input type="checkbox" checked={!!o} onChange={(e) => patch(el.id, { overlay: e.target.checked ? { color: "#000000", opacity: 0.4 } : undefined })} />
      </label>
      {o && (
        <>
          <ColorField value={o.color} onChange={(color) => patch(el.id, { overlay: { ...o, color } })} />
          <Slider label={t("insp.opacity")} min={0.05} max={0.95} value={o.opacity} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => patch(el.id, { overlay: { ...o, opacity } })} />
        </>
      )}
    </>
  );
}

function IconProps({ el }: { el: IconEl }) {
  const t = useT();
  return (
    <Section title={`${t("type.icon")} · ${el.icon}`}>
      <span className="label">{t("insp.color")}</span>
      <ColorField value={el.color} onChange={(color) => patch(el.id, { color })} />
      <BrandSwatches onPick={(color) => patch(el.id, { color })} />
      <Slider label={t("icon.stroke")} min={0.5} max={4} step={0.25} value={el.strokeWidth} onChange={(strokeWidth) => patch(el.id, { strokeWidth })} />
      <Button className="w-full" onClick={() => useUi.getState().setLeftTab("elements")}>{t("icon.change")}</Button>
    </Section>
  );
}

function QrProps({ el }: { el: QrEl }) {
  const t = useT();
  const ok = !!qrPath(el.data);
  return (
    <Section title={t("type.qr")}>
      <QrDataEditor value={el.data} onChange={(data) => patch(el.id, { data })} />
      {!ok && <p className="text-[11px] text-danger">{t("qr.tooLong")}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="label">{t("qr.color")}</span>
          <ColorField value={el.color} onChange={(color) => patch(el.id, { color })} />
        </div>
        <div>
          <span className="label">{t("qr.background")}</span>
          <ColorField value={el.background} onChange={(background) => patch(el.id, { background })} />
        </div>
      </div>
      <BrandSwatches onPick={(color) => patch(el.id, { color })} />
      <p className="text-[11px] leading-relaxed text-muted">{t("qr.hint")}</p>
    </Section>
  );
}

/** Link, WhatsApp chat or plain text for a QR code. */
export function QrDataEditor({ value, onChange }: { value: string; onChange(data: string): void }) {
  const t = useT();
  const wa = parseWaLink(value);
  const [mode, setMode] = useState<"link" | "wa" | "text">(wa ? "wa" : /^https?:\/\//i.test(value) || !value ? "link" : "text");
  return (
    <div className="space-y-2">
      <div className="flex rounded-md border border-line p-0.5 text-[11px]">
        {(["link", "wa", "text"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded px-2 py-1 ${mode === m ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}>
            {t(`qr.mode.${m}`)}
          </button>
        ))}
      </div>
      {mode === "wa" ? (
        <>
          <input className="field" inputMode="tel" placeholder="0812 3456 7890" value={wa?.phone ?? ""} onChange={(e) => onChange(waLink(e.target.value, wa?.text))} />
          <input className="field" placeholder={t("qr.waMessage")} value={wa?.text ?? ""} onChange={(e) => onChange(waLink(wa?.phone ?? "", e.target.value))} />
        </>
      ) : mode === "link" ? (
        <input className="field" placeholder="https://…" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      ) : (
        <textarea className="field min-h-14 resize-y" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** The brand kit's colors as one-click swatches (nothing without a kit). */
function BrandSwatches({ onPick }: { onPick(c: string): void }) {
  const t = useT();
  const brand = useBrandKit(useDesign((s) => s.design.workspaceId));
  if (!brand.colors.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-[10px] text-muted">{t("brand.short")}</span>
      {brand.colors.map((c) => <button key={c} title={c} onClick={() => onPick(c)} className="h-5 w-5 rounded border border-accent/40" style={{ background: c }} />)}
    </div>
  );
}

function StrokeProps({ stroke, width, required, onChange }: { stroke?: string; width?: number; required?: boolean; onChange(stroke: string | undefined, width: number | undefined): void }) {
  const t = useT();
  const on = required || !!stroke;
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between">
        <span className="label mb-0">{t("insp.stroke")}</span>
        {!required && <input type="checkbox" checked={on} onChange={(e) => (e.target.checked ? onChange("#111111", 4) : onChange(undefined, undefined))} />}
      </label>
      {on && (
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <ColorField value={stroke ?? "#111111"} onChange={(c) => onChange(c, width ?? 4)} />
          <NumberField value={width ?? 4} step={1} min={0} max={200} onChange={(w) => onChange(stroke ?? "#111111", w)} suffix="px" />
        </div>
      )}
    </div>
  );
}

function ShadowProps({ el }: { el: El }) {
  const t = useT();
  const s = el.shadow;
  const set = (x: Partial<Shadow> | null) => patch(el.id, { shadow: x === null ? null : { ...(s ?? { color: "rgba(0,0,0,0.35)", blur: 16, offsetX: 0, offsetY: 6 }), ...x } });
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between">
        <span className="label mb-0">{t("insp.shadow")}</span>
        <input type="checkbox" checked={!!s} onChange={(e) => set(e.target.checked ? {} : null)} />
      </label>
      {s && (
        <>
          <ColorField value={s.color} onChange={(color) => set({ color })} />
          <Slider label={t("insp.blur")} min={0} max={100} step={1} value={s.blur} onChange={(blur) => set({ blur })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={s.offsetX} step={1} onChange={(offsetX) => set({ offsetX })} />
            <NumberField label="Y" value={s.offsetY} step={1} onChange={(offsetY) => set({ offsetY })} />
          </div>
        </>
      )}
    </div>
  );
}

const SWATCHES = ["#ffffff", "#111111", "#7c5cff", "#22d3c5", "#ff3d9a", "#ffd23f", "#ff5a1f", "#0f3d3e", "#e2725b", "#f4f1ea"];

export function FillEditor({ value, onChange }: { value: Fill; onChange(f: Fill): void }) {
  const t = useT();
  const brand = useBrandKit(useDesign((s) => s.design.workspaceId));
  const grad = isGradient(value);
  return (
    <div className="space-y-2">
      <div className="flex rounded-md border border-line p-0.5 text-[11px]">
        {(["solid", "gradient"] as const).map((k) => (
          <button
            key={k}
            onClick={() => onChange(k === "solid" ? solidOf(value) : grad ? value : { kind: "linear", angle: 90, colors: [solidOf(value), "#7c5cff"] })}
            className={`flex-1 rounded px-2 py-1 ${(k === "gradient") === grad ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}
          >
            {t(`insp.${k}`)}
          </button>
        ))}
      </div>
      {grad ? (
        <>
          {value.colors.map((c, i) => (
            <ColorField key={i} value={c} onChange={(v) => onChange({ ...value, colors: value.colors.map((x, j) => (j === i ? v : x)) })} />
          ))}
          <Slider label={t("insp.angle")} min={0} max={360} step={1} value={value.angle} format={(v) => `${Math.round(v)}°`} onChange={(angle) => onChange({ ...value, angle })} />
        </>
      ) : (
        <>
          <ColorField value={value} onChange={onChange} />
          {brand.colors.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[10px] text-muted">{t("brand.short")}</span>
              {brand.colors.map((c) => (
                <button key={c} title={c} onClick={() => onChange(c)} className="h-5 w-5 rounded border border-accent/40" style={{ background: c }} />
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {SWATCHES.map((c) => (
              <button key={c} title={c} onClick={() => onChange(c)} className="h-5 w-5 rounded border border-line" style={{ background: c }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Native color picker plus a free-form CSS color field. */
export function ColorField({ value, onChange }: { value: string; onChange(c: string): void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((c) => c + c).join("")}` : "#000000";
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" className="h-7 w-9 shrink-0 cursor-pointer rounded border border-line bg-transparent" value={hex} onChange={(e) => onChange(e.target.value)} />
      <input className="field font-mono" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
    </div>
  );
}
