// Pages of the design (a carousel) under the canvas: open, add; copy, move and delete the open page.
import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { useDesign } from "../../store/design";
import { confirm } from "../../store/ui";
import { allPages, pageAsDesign } from "../../lib/pages";
import { useT } from "../../i18n";
import { DesignPreview } from "./DesignPreview";

export function PageStrip() {
  const t = useT();
  const design = useDesign((s) => s.design);
  const open = design.page ?? 0;
  const previews = useMemo(() => allPages(design).map((p, i) => ({ id: p.id, d: pageAsDesign(design, i) })), [design]);
  const store = useDesign.getState();
  const tall = design.height >= design.width;

  const remove = async (i: number) => {
    if (previews[i].d.elements.length && !(await confirm({ title: t("pages.delete"), message: t("pages.deleteConfirm", { n: i + 1 }), confirmLabel: t("common.delete"), danger: true }))) return;
    useDesign.getState().removePage(i);
  };

  return (
    <div className="flex h-[92px] shrink-0 items-center gap-2 overflow-x-auto border-t border-line bg-panel px-3">
      {previews.map(({ id, d }, i) => (
        <div key={id} className="relative shrink-0">
          <button
            onClick={() => store.openPage(i)}
            title={t("pages.page", { n: i + 1 })}
            className={`block overflow-hidden rounded-md border-2 ${i === open ? "border-accent" : "border-transparent hover:border-line"}`}
          >
            <div className={tall ? "h-16" : "w-24"} style={{ aspectRatio: `${design.width}/${design.height}` }}>
              <DesignPreview design={d} className="h-full w-full" />
            </div>
          </button>
          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">{i + 1}</span>
        </div>
      ))}
      <button
        onClick={() => store.addPage(false)}
        title={t("pages.add")}
        className={`flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-line text-[10px] text-muted hover:border-accent hover:text-text ${tall ? "h-16 w-12" : "h-14 w-24"}`}
      >
        <Plus size={14} /> {t("pages.addShort")}
      </button>
      <div className="ml-1 flex shrink-0 items-center gap-0.5 text-[11px] text-muted">
        {previews.length > 1 && <span className="mr-1">{t("pages.count", { n: open + 1, total: previews.length })}</span>}
        {open > 0 && <MiniButton title={t("pages.left")} onClick={() => store.movePage(open, open - 1)}><ChevronLeft size={13} /></MiniButton>}
        {open < previews.length - 1 && <MiniButton title={t("pages.right")} onClick={() => store.movePage(open, open + 1)}><ChevronRight size={13} /></MiniButton>}
        <MiniButton title={t("pages.duplicate")} onClick={() => store.addPage(true)}><Copy size={13} /></MiniButton>
        {previews.length > 1 && <MiniButton title={t("pages.delete")} onClick={() => void remove(open)} danger><Trash2 size={13} /></MiniButton>}
      </div>
    </div>
  );
}

function MiniButton({ title, onClick, danger, children }: { title: string; onClick(): void; danger?: boolean; children: ReactNode }) {
  return (
    <button title={title} onClick={onClick} className={`flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-panel-2 ${danger ? "hover:text-danger" : "hover:text-text"}`}>
      {children}
    </button>
  );
}
