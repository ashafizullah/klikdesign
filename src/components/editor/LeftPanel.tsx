// Asset sidebar: templates, text presets, shapes and uploaded images.
import { Image as ImageIcon, LayoutTemplate, Shapes, Type, Upload } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import type { El } from "../../types/design";
import { normalizeElement } from "../../types/design";
import { normalizeDesign, useDesign } from "../../store/design";
import { confirm, notifyError, useUi, type LeftTab } from "../../store/ui";
import { SHAPE_PRESETS, TEMPLATES, TEXT_PRESETS, placeOnPage } from "../../lib/templates";
import { ensureFont } from "../../lib/fonts";
import { ipc } from "../../lib/ipc";
import { loadImage, loadWorkspaceImage } from "../../lib/images";
import { IMAGE_EXTS, importImages, mediaChanged, placeImage, useMedia } from "../../lib/media";
import { workspaceName } from "../../lib/workspace";
import { polygonPoints } from "../../lib/geometry";
import { useT } from "../../i18n";
import { Button } from "../ui";
import { DesignPreview } from "./DesignPreview";

const TABS: { id: LeftTab; icon: typeof Type; label: "left.templates" | "left.text" | "left.shapes" | "left.uploads" }[] = [
  { id: "templates", icon: LayoutTemplate, label: "left.templates" },
  { id: "text", icon: Type, label: "left.text" },
  { id: "shapes", icon: Shapes, label: "left.shapes" },
  { id: "uploads", icon: Upload, label: "left.uploads" },
];

function addRaw(raw: Record<string, unknown>) {
  const { design, add } = useDesign.getState();
  const el = normalizeElement(placeOnPage(raw, design), "");
  if (!el) return;
  if (el.type === "text") void ensureFont(el.fontFamily);
  const { id: _id, ...rest } = el;
  add([rest]);
}

export function LeftPanel() {
  const t = useT();
  const tab = useUi((s) => s.leftTab);
  const setTab = useUi((s) => s.setLeftTab);
  return (
    <aside className="flex h-full shrink-0 border-r border-line bg-panel">
      <nav className="flex w-[68px] flex-col items-center gap-1 border-r border-line py-2">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[10px] ${tab === id ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}
          >
            <Icon size={18} /> {t(label)}
          </button>
        ))}
      </nav>
      <div className="w-[260px] overflow-y-auto p-3">
        {tab === "templates" && <Templates />}
        {tab === "text" && <TextTab />}
        {tab === "shapes" && <ShapesTab />}
        {tab === "uploads" && <Uploads />}
      </div>
    </aside>
  );
}

function Templates() {
  const t = useT();
  const apply = async (id: string) => {
    const tpl = TEMPLATES.find((x) => x.id === id)!;
    const cur = useDesign.getState().design;
    if (cur.elements.length && !(await confirm({ title: t("left.replaceTitle"), message: t("left.replaceConfirm"), confirmLabel: t("left.replace") }))) return;
    const next = normalizeDesign({ ...structuredClone(tpl.design), id: cur.id, name: cur.name } as never);
    for (const e of next.elements) if (e.type === "text") void ensureFont(e.fontFamily);
    useDesign.getState().update((d) => Object.assign(d, { width: next.width, height: next.height, background: next.background, elements: next.elements }));
    useDesign.getState().select([]);
    useUi.getState().setZoom(null);
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {TEMPLATES.map((tpl) => (
        <button key={tpl.id} onClick={() => apply(tpl.id).catch(notifyError)} className="group text-left">
          <TemplateThumb tpl={tpl} />
          <div className="mt-1 truncate text-[11px] text-muted group-hover:text-text">{t(tpl.name)}</div>
        </button>
      ))}
    </div>
  );
}

/** Preview of a template as it will look on the page. */
export function TemplateThumb({ tpl }: { tpl: (typeof TEMPLATES)[number] }) {
  const d = useMemo(() => normalizeDesign(tpl.design as never), [tpl]);
  return <DesignPreview design={d} className="rounded-md border border-line group-hover:border-accent" />;
}

/** SVG icon of a shape preset. */
function ThumbEl({ e }: { e: El }) {
  const fill = e.type === "image" ? "#ccc" : typeof e.fill === "string" ? e.fill : e.fill.colors[0];
  const tf = `translate(${e.x} ${e.y}) rotate(${e.rotation})`;
  if (e.type === "text") return null;
  if (e.type === "image") return <rect transform={tf} width={e.w} height={e.h} fill={fill} />;
  if (e.shape === "ellipse") return <ellipse transform={tf} cx={e.w / 2} cy={e.h / 2} rx={e.w / 2} ry={e.h / 2} fill={fill} opacity={e.opacity} />;
  if (e.shape === "line") return <line transform={tf} x1={0} y1={e.h / 2} x2={e.w} y2={e.h / 2} stroke={e.stroke} strokeWidth={e.strokeWidth} />;
  if (e.shape === "rect") return <rect transform={tf} width={e.w} height={e.h} rx={e.cornerRadius} fill={fill} opacity={e.opacity} />;
  return <polygon transform={tf} points={polygonPoints(e.shape, e.w, e.h).join(" ")} fill={fill} opacity={e.opacity} />;
}

function TextTab() {
  const t = useT();
  const sizes = { heading: "text-[22px] font-extrabold", subheading: "text-[16px] font-semibold", body: "text-[12px]" };
  return (
    <div className="space-y-2">
      <Button variant="primary" className="w-full" onClick={() => addRaw(TEXT_PRESETS[0].el)}>
        <Type size={14} /> {t("left.addText")}
      </Button>
      {TEXT_PRESETS.map((p) => (
        <button key={p.id} onClick={() => addRaw(p.el)} className={`block w-full rounded-md border border-line bg-panel-2 px-3 py-2.5 text-left hover:border-accent ${sizes[p.id]}`}>
          {t(`left.${p.id}`)}
        </button>
      ))}
    </div>
  );
}

function ShapesTab() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {SHAPE_PRESETS.map((p) => {
        const e = normalizeElement(p.el, p.id)!;
        return (
          <button key={p.id} onClick={() => addRaw(p.el)} className="flex aspect-square items-center justify-center rounded-md border border-line bg-panel-2 p-2 hover:border-accent">
            <svg viewBox={`-20 -20 ${e.w + 40} ${Math.max(e.h, 40) + 40}`} className="h-full w-full">
              {e.type === "shape" && e.fill && typeof e.fill !== "string" && (
                <defs>
                  <linearGradient id={`g-${p.id}`} x1="0" y1="0" x2="1" y2="1">
                    {e.fill.colors.map((c, i) => <stop key={i} offset={i / (e.fill as { colors: string[] }).colors.length} stopColor={c} />)}
                  </linearGradient>
                </defs>
              )}
              <ThumbEl e={e.type === "shape" && typeof e.fill !== "string" ? { ...e, fill: `url(#g-${p.id})` } : e} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function Uploads() {
  const t = useT();
  const designId = useDesign((s) => s.design.id);
  // Reload when images are added or removed on the page, or files are imported.
  const placed = useDesign((s) => s.design.elements.filter((e) => e.type === "image").length);
  const version = useMedia((s) => s.version);
  const [srcs, setSrcs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    ipc.mediaList(designId).then((l) => live && setSrcs(l), notifyError);
    return () => void (live = false);
  }, [designId, placed, version]);

  const upload = async () => {
    const picked = await openDialog({ multiple: true, filters: [{ name: t("left.images"), extensions: IMAGE_EXTS }] });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (!paths.length) return;
    setBusy(true);
    try {
      await importImages(paths);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="primary" className="w-full" disabled={busy} onClick={() => upload().catch(notifyError)}>
        <Upload size={14} /> {t("left.upload")}
      </Button>
      <div>
        <div className="label">{t("left.designImages")}</div>
        {srcs.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted">{t("left.uploadsEmpty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {srcs.map((src) => (
              <button key={src} onClick={() => placeImage(src).catch(notifyError)} className="overflow-hidden rounded-md border border-line hover:border-accent">
                <Thumb src={src} />
              </button>
            ))}
          </div>
        )}
      </div>
      <ProjectImages />
    </div>
  );
}

/** Images from the linked project folder (logo, icons, screenshots). */
function ProjectImages() {
  const t = useT();
  const wsId = useDesign((s) => s.design.workspaceId);
  const [list, setList] = useState<string[] | null>(null);
  useEffect(() => {
    setList(null);
    if (!wsId) return;
    let live = true;
    ipc.wsImages(wsId).then((l) => live && setList(l), (e) => (notifyError(e), live && setList([])));
    return () => void (live = false);
  }, [wsId]);
  if (!wsId) return null;
  const pick = async (rel: string) => {
    await placeImage(await ipc.wsImageImport(useDesign.getState().design.id, wsId, rel));
    mediaChanged();
  };
  return (
    <div>
      <div className="label">{t("ws.images", { name: workspaceName(wsId) ?? "" })}</div>
      {list === null ? (
        <p className="text-[11px] text-muted">…</p>
      ) : list.length === 0 ? (
        <p className="text-[11px] text-muted">{t("ws.noImages")}</p>
      ) : (
        <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto">
          {list.slice(0, 60).map((rel) => (
            <button key={rel} title={rel} onClick={() => pick(rel).catch(notifyError)} className="overflow-hidden rounded border border-line bg-white/5 hover:border-accent">
              <Thumb load={() => loadWorkspaceImage(wsId, rel)} id={`${wsId}:${rel}`} contain />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Thumb({ src, load, id, contain }: { src?: string; load?: () => Promise<HTMLImageElement>; id?: string; contain?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const key = id ?? src;
  useEffect(() => {
    let live = true;
    (load ? load() : loadImage(src!)).then((i) => live && setUrl(i.src), () => {});
    return () => void (live = false);
  }, [key]);
  return url ? <img src={url} alt="" className={`aspect-square w-full ${contain ? "object-contain p-1" : "object-cover"}`} draggable={false} /> : <div className="flex aspect-square items-center justify-center text-muted"><ImageIcon size={16} /></div>;
}
