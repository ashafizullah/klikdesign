// Stack of elements, top first: select, rename, hide, lock and reorder by drag.
import { useState } from "react";
import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
import type { El } from "../../types/design";
import { useDesign } from "../../store/design";
import { useT } from "../../i18n";
import { Empty } from "../ui";
import { ElementThumb } from "./DesignPreview";

const label = (e: El) => e.name || (e.type === "text" ? e.text.split("\n")[0].slice(0, 40) : e.type === "shape" ? e.shape : "image");

export function Layers() {
  const t = useT();
  const elements = useDesign((s) => s.design.elements);
  const selected = useDesign((s) => s.selected);
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const top = [...elements].reverse();

  const drop = (toTopIndex: number) => {
    if (!drag) return;
    useDesign.getState().update((d) => {
      const from = d.elements.findIndex((e) => e.id === drag.id);
      if (from < 0) return;
      const [el] = d.elements.splice(from, 1);
      // List shows top first; convert back to bottom-first order.
      const to = Math.max(0, Math.min(d.elements.length, d.elements.length - toTopIndex));
      d.elements.splice(to, 0, el);
    });
    setDrag(null);
  };

  if (!elements.length) return <Empty>{t("layers.empty")}</Empty>;
  return (
    <div className="p-2">
      <div className="label px-1 py-1">{t("layers.title", { n: elements.length })}</div>
      {top.map((e, i) => {
        const sel = selected.includes(e.id);
        return (
          <div
            key={e.id}
            draggable
            onDragStart={() => setDrag({ id: e.id, over: i })}
            onDragOver={(ev) => {
              ev.preventDefault();
              if (drag && drag.over !== i) setDrag({ ...drag, over: i });
            }}
            onDrop={() => drop(i)}
            onDragEnd={() => setDrag(null)}
            onClick={(ev) => {
              const store = useDesign.getState();
              if (ev.shiftKey || ev.metaKey) store.select(sel ? store.selected.filter((x) => x !== e.id) : [...store.selected, e.id]);
              else store.select([e.id]);
            }}
            className={`group flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-[12px] ${sel ? "bg-accent-2/20" : "hover:bg-panel-2"} ${drag?.over === i && drag.id !== e.id ? "border-t-2 border-accent" : "border-t-2 border-transparent"} ${e.hidden ? "opacity-50" : ""}`}
          >
            <ElementThumb e={e} />
            <span className="min-w-0 flex-1 truncate">{label(e)}</span>
            <button
              className={`text-muted hover:text-text ${e.locked ? "" : "opacity-0 group-hover:opacity-100"}`}
              title={t(e.locked ? "insp.unlock" : "insp.lock")}
              onClick={(ev) => (ev.stopPropagation(), useDesign.getState().patch(e.id, { locked: e.locked ? undefined : true }))}
            >
              {e.locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <button
              className={`text-muted hover:text-text ${e.hidden ? "" : "opacity-0 group-hover:opacity-100"}`}
              title={t(e.hidden ? "layers.show" : "layers.hide")}
              onClick={(ev) => (ev.stopPropagation(), useDesign.getState().patch(e.id, { hidden: e.hidden ? undefined : true }))}
            >
              {e.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
