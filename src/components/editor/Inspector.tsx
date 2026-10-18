// Properties of the selection, or of the page when nothing is selected.
import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignLeft, AlignRight,
  AlignStartHorizontal, AlignStartVertical, ArrowDownToLine, ArrowUpToLine, Bold, CaseUpper, ChevronDown, ChevronUp, Copy, Italic, Lock, Trash2, Unlock,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { El, Fill, ImageEl, ShapeEl, Shadow, TextEl } from "../../types/design";
import { SIZE_PRESETS, isGradient, solidOf } from "../../types/design";
import { useDesign } from "../../store/design";
import { useUi } from "../../store/ui";
import { FONTS, ensureFont, fontInfo, nearestWeight } from "../../lib/fonts";
import { bounds, textHeight } from "../../lib/geometry";
import { textLines } from "../../lib/stage";
import { useT } from "../../i18n";
import { IconButton, NumberField, Section, Slider } from "../ui";

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
  const align = (mode: "l" | "c" | "r" | "t" | "m" | "b") => {
    const { design } = useDesign.getState();
    const lines = textLines();
    // Text boxes use the measured height; the stored one is not kept up to date.
    const boxes = sel.map((e) => ({ e, b: bounds(e.type === "text" ? { ...e, h: textHeight(lines[e.id]?.length ?? 1, e.fontSize, e.lineHeight) } : e) }));
    // One element aligns to the page; several align to their shared bounds.
    const area =
      sel.length === 1
        ? { x: 0, y: 0, w: design.width, h: design.height }
        : (() => {
            const x = Math.min(...boxes.map(({ b }) => b.x));
            const y = Math.min(...boxes.map(({ b }) => b.y));
            return { x, y, w: Math.max(...boxes.map(({ b }) => b.x + b.w)) - x, h: Math.max(...boxes.map(({ b }) => b.y + b.h)) - y };
          })();
    useDesign.getState().patchMany(
      boxes.map(({ e, b }) => {
        const dx = mode === "l" ? area.x - b.x : mode === "c" ? area.x + area.w / 2 - (b.x + b.w / 2) : mode === "r" ? area.x + area.w - (b.x + b.w) : 0;
        const dy = mode === "t" ? area.y - b.y : mode === "m" ? area.y + area.h / 2 - (b.y + b.h / 2) : mode === "b" ? area.y + area.h - (b.y + b.h) : 0;
        return { id: e.id, patch: { x: e.x + dx, y: e.y + dy } };
      }),
    );
  };
  return (
    <Section title={sel.length > 1 ? t("insp.selected", { n: sel.length }) : t(`type.${sel[0].type}`)}>
      <div className="flex flex-wrap gap-0.5">
        <IconButton title={t("insp.alignLeft")} onClick={() => align("l")}><AlignStartVertical size={15} /></IconButton>
        <IconButton title={t("insp.alignCenter")} onClick={() => align("c")}><AlignCenterVertical size={15} /></IconButton>
        <IconButton title={t("insp.alignRight")} onClick={() => align("r")}><AlignEndVertical size={15} /></IconButton>
        <IconButton title={t("insp.alignTop")} onClick={() => align("t")}><AlignStartHorizontal size={15} /></IconButton>
        <IconButton title={t("insp.alignMiddle")} onClick={() => align("m")}><AlignCenterHorizontal size={15} /></IconButton>
        <IconButton title={t("insp.alignBottom")} onClick={() => align("b")}><AlignEndHorizontal size={15} /></IconButton>
      </div>
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
      <select
        className="field"
        value={el.fontFamily}
        style={{ fontFamily: `"${el.fontFamily}"` }}
        onChange={(e) => {
          const family = e.target.value;
          void ensureFont(family);
          p({ fontFamily: family, fontWeight: nearestWeight(family, el.fontWeight), italic: fontInfo(family)?.italic ? el.italic : undefined });
        }}
      >
        {FONTS.map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}
      </select>
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
  return (
    <Section title={t("type.image")}>
      <Slider label={t("insp.radius")} min={0} max={Math.min(el.w, el.h) / 2} step={1} value={el.cornerRadius ?? 0} format={(v) => `${Math.round(v)}px`} onChange={(cornerRadius) => patch(el.id, { cornerRadius: cornerRadius || undefined })} />
    </Section>
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
