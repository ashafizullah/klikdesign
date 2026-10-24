// The Elements tab: shapes, Lucide icons (searchable), QR codes and photo frames.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, QrCode, Search } from "lucide-react";
import type { IconEl, ImageEl, Mask } from "../../types/design";
import { normalizeElement } from "../../types/design";
import { useDesign } from "../../store/design";
import { useBrandKit } from "../../store/brand";
import { placeOnPage } from "../../lib/templates";
import { loadIcons, searchIcons, useIcons } from "../../lib/icons";
import { qrPath } from "../../lib/qr";
import { useT } from "../../i18n";
import { Button } from "../ui";
import { MarkSvg } from "./DesignPreview";
import { FramePicker, QrDataEditor } from "./Inspector";

function addRaw(raw: Record<string, unknown>) {
  const { design, add } = useDesign.getState();
  const el = normalizeElement(placeOnPage(raw, design), "");
  if (!el) return;
  const { id: _id, ...rest } = el;
  add([rest]);
}

function Group({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="label mb-0">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function ElementsTab({ shapes }: { shapes: ReactNode }) {
  const t = useT();
  return (
    <div className="space-y-5">
      <Group title={t("left.shapes")}>{shapes}</Group>
      <Icons />
      <Qr />
      <Frames />
      <p className="text-[10px] leading-relaxed text-muted">{t("elements.credits")}</p>
    </div>
  );
}

function Icons() {
  const t = useT();
  const lib = useIcons((s) => s.lib);
  const [query, setQuery] = useState("");
  useEffect(() => void loadIcons(), []);
  const names = useMemo(() => (lib ? searchIcons(lib, query, 96) : []), [lib, query]);
  // With one icon selected, picking another swaps it in place.
  const selectedIcon = useDesign((s) => {
    const sel = s.design.elements.filter((e) => s.selected.includes(e.id));
    return sel.length === 1 && sel[0].type === "icon" ? (sel[0] as IconEl) : null;
  });
  const brand = useBrandKit(useDesign((s) => s.design.workspaceId));
  const pick = (icon: string) => {
    if (selectedIcon) return useDesign.getState().patch(selectedIcon.id, { icon });
    addRaw({ type: "icon", icon, w: 160, h: 160, color: brand.colors[0] ?? "#111111", strokeWidth: 2, rotation: 0, opacity: 1 });
  };
  return (
    <Group title={t("elements.icons")} right={selectedIcon && <span className="text-[10px] text-accent">{t("elements.replacing")}</span>}>
      <label className="relative block">
        <Search size={13} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted" />
        <input className="field" style={{ paddingLeft: 26 }} placeholder={t("elements.searchIcons")} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
      </label>
      {!lib ? (
        <div className="flex h-24 items-center justify-center text-muted"><Loader2 size={16} className="animate-spin" /></div>
      ) : names.length ? (
        <div className="grid grid-cols-6 gap-1">
          {names.map((name) => (
            <button key={name} title={name} onClick={() => pick(name)} className="flex aspect-square items-center justify-center rounded-md p-1.5 text-text hover:bg-panel-2">
              <svg viewBox="0 0 24 24" className="h-full w-full">
                <MarkSvg e={{ type: "icon", icon: name, color: "currentColor", strokeWidth: 2, w: 24, h: 24 }} />
              </svg>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted">{t("elements.noIcons")}</p>
      )}
    </Group>
  );
}

function Qr() {
  const t = useT();
  const [data, setData] = useState("https://");
  const ok = data.trim().length > 0 && data.trim() !== "https://" && !!qrPath(data.trim());
  return (
    <Group title={t("type.qr")}>
      <QrDataEditor value={data} onChange={setData} />
      <Button
        className="w-full"
        disabled={!ok}
        onClick={() => addRaw({ type: "qr", data: data.trim(), w: 300, h: 300, color: "#111111", background: "#ffffff", rotation: 0, opacity: 1 })}
      >
        <QrCode size={14} /> {t("qr.add")}
      </Button>
    </Group>
  );
}

function Frames() {
  const t = useT();
  const image = useDesign((s) => {
    const sel = s.design.elements.filter((e) => s.selected.includes(e.id));
    return sel.length === 1 && sel[0].type === "image" ? (sel[0] as ImageEl) : null;
  });
  return (
    <Group title={t("frame.title")}>
      <FramePicker value={image?.mask} disabled={!image} onChange={(mask: Mask | undefined) => image && useDesign.getState().patch(image.id, { mask })} />
      {!image && <p className="text-[11px] text-muted">{t("frame.selectPhoto")}</p>}
    </Group>
  );
}
