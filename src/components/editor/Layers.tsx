// Stack of elements, top first: select, hide, lock and reorder by dragging a row.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eye, EyeOff, GripVertical, Lock, Unlock } from "lucide-react";
import type { El } from "../../types/design";
import { useDesign } from "../../store/design";
import { useT } from "../../i18n";
import { Empty } from "../ui";
import { ElementThumb } from "./DesignPreview";

const label = (e: El) => e.name || (e.type === "text" ? e.text.split("\n")[0].slice(0, 40) : e.type === "shape" ? e.shape : "image");

/** Moves the element at top-first index `from` so it lands before top-first index `to` (`to` may be the length). */
export function moveLayer(elements: El[], from: number, to: number): El[] {
  const top = [...elements].reverse();
  const [el] = top.splice(from, 1);
  top.splice(to > from ? to - 1 : to, 0, el);
  return top.reverse();
}

// Pointer events rather than HTML5 drag and drop: the Tauri window handles native drops (image files) itself.
export function Layers() {
  const t = useT();
  const elements = useDesign((s) => s.design.elements);
  const selected = useDesign((s) => s.selected);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ from: number; startY: number; moved: boolean } | null>(null);
  /** Top-first index the dragged row would be inserted before, while dragging. */
  const [target, setTarget] = useState<{ from: number; to: number } | null>(null);
  const top = [...elements].reverse();

  const indexAt = (y: number) => {
    const i = rows.current.findIndex((r) => r && y < r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2);
    return i < 0 ? top.length : i;
  };
  const onDown = (ev: ReactPointerEvent<HTMLDivElement>, i: number) => {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest("button")) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = { from: i, startY: ev.clientY, moved: false };
  };
  const onMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(ev.clientY - d.startY) < 4) return;
    d.moved = true;
    setTarget({ from: d.from, to: indexAt(ev.clientY) });
  };
  const onUp = (ev: ReactPointerEvent<HTMLDivElement>, e: El, sel: boolean) => {
    const d = drag.current;
    drag.current = null;
    setTarget(null);
    if (!d) return;
    if (d.moved) {
      const to = indexAt(ev.clientY);
      if (to !== d.from && to !== d.from + 1) useDesign.getState().update((doc) => void (doc.elements = moveLayer(doc.elements, d.from, to)));
      return;
    }
    const store = useDesign.getState();
    if (ev.shiftKey || ev.metaKey) store.select(sel ? store.selected.filter((x) => x !== e.id) : [...store.selected, e.id]);
    else store.select([e.id]);
  };

  if (!elements.length) return <Empty>{t("layers.empty")}</Empty>;
  return (
    <div className="p-2">
      <div className="label px-1 py-1">{t("layers.title", { n: elements.length })}</div>
      {top.map((e, i) => {
        const sel = selected.includes(e.id);
        const line = target && target.to !== target.from && target.to !== target.from + 1;
        return (
          <div
            key={e.id}
            ref={(r) => void (rows.current[i] = r)}
            onPointerDown={(ev) => onDown(ev, i)}
            onPointerMove={onMove}
            onPointerUp={(ev) => onUp(ev, e, sel)}
            onPointerCancel={() => ((drag.current = null), setTarget(null))}
            className={`group flex cursor-default touch-none items-center gap-2 rounded-md px-2 py-1 text-[12px] select-none ${sel ? "bg-accent-2/20" : "hover:bg-panel-2"} ${
              line && target.to === i ? "border-t-2 border-accent" : line && target.to === top.length && i === top.length - 1 ? "border-b-2 border-accent" : "border-y-2 border-transparent"
            } ${e.hidden ? "opacity-50" : ""} ${target?.from === i ? "opacity-60" : ""}`}
          >
            <GripVertical size={12} className="-mx-1 shrink-0 cursor-grab text-muted opacity-0 group-hover:opacity-100" />
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
