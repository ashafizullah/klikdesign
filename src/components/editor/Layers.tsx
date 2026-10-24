// Stack of elements, top first: select, hide, lock and reorder by dragging a row.
// Members of a group are indented under a row that selects the whole group.
import { Fragment, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eye, EyeOff, GripVertical, Group, Lock, Unlock } from "lucide-react";
import type { El } from "../../types/design";
import { useDesign } from "../../store/design";
import { settleMoved } from "../../lib/groups";
import { openElementMenu } from "./ElementMenu";
import { create } from "zustand";
import { useUi } from "../../store/ui";
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

const useGroupRename = create<{ groupId: string | null }>()(() => ({ groupId: null }));
/** Shows the Layers tab with group `groupId`'s name being edited. */
export function startGroupRename(groupId: string) {
  useUi.getState().setRightTab("layers");
  useGroupRename.setState({ groupId });
}

function GroupNameInput({ groupId, name }: { groupId: string; name: string }) {
  const t = useT();
  const [value, setValue] = useState(name);
  const done = (save: boolean) => {
    if (save && value.trim() !== name) useDesign.getState().renameGroup(groupId, value);
    useGroupRename.setState({ groupId: null });
  };
  return (
    <input
      autoFocus
      className="field h-6 min-w-0 flex-1 px-1.5 py-0 text-[12px]"
      placeholder={t("layers.group")}
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      }}
    />
  );
}

// Pointer events rather than HTML5 drag and drop: the Tauri window handles native drops (image files) itself.
export function Layers() {
  const t = useT();
  const elements = useDesign((s) => s.design.elements);
  const selected = useDesign((s) => s.selected);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ from: number; startY: number; moved: boolean } | null>(null);
  /** Row a shift-click selects from. */
  const anchor = useRef<string | null>(null);
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
      if (to !== d.from && to !== d.from + 1) {
        useDesign.getState().update((doc) => {
          const moved = moveLayer(doc.elements, d.from, to);
          doc.elements = settleMoved(moved, moved.findIndex((x) => x.id === e.id));
        });
      }
      return;
    }
    const store = useDesign.getState();
    // Shift selects the rows from the last clicked one to this one; ⌘/Ctrl adds or removes one row.
    // Without a clicked row yet (selected on the canvas), the range starts at the selected element.
    const start = anchor.current && store.selected.includes(anchor.current) ? anchor.current : store.selected.at(-1);
    const from = top.findIndex((x) => x.id === start);
    if (ev.shiftKey && from >= 0) {
      const i = top.findIndex((x) => x.id === e.id);
      return store.select(top.slice(Math.min(from, i), Math.max(from, i) + 1).map((x) => x.id));
    }
    anchor.current = e.id;
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) store.select(sel ? store.selected.filter((x) => x !== e.id) : [...store.selected, e.id]);
    else store.select([e.id]);
  };

  const renaming = useGroupRename((s) => s.groupId);
  if (!elements.length) return <Empty>{t("layers.empty")}</Empty>;
  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="label px-1 py-1">{t("layers.title", { n: elements.length })}</div>
      {top.map((e, i) => {
        const sel = selected.includes(e.id);
        const line = target && target.to !== target.from && target.to !== target.from + 1;
        const groupStart = !!e.groupId && top[i - 1]?.groupId !== e.groupId;
        const members = groupStart ? elements.filter((x) => x.groupId === e.groupId).map((x) => x.id) : [];
        return (
          <Fragment key={e.id}>
            {groupStart && (
              <div
                onClick={() => useDesign.getState().select(members)}
                onDoubleClick={() => startGroupRename(e.groupId!)}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  useDesign.getState().select(members);
                  openElementMenu({ x: ev.clientX, y: ev.clientY });
                }}
                title={t("layers.renameHint")}
                className={`flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-[12px] select-none ${members.every((id) => selected.includes(id)) ? "bg-accent/15" : "hover:bg-panel-2"}`}
              >
                <Group size={13} className="shrink-0 text-muted" />
                {renaming === e.groupId ? (
                  <GroupNameInput groupId={e.groupId} name={e.groupName ?? ""} />
                ) : (
                  <span className="min-w-0 flex-1 truncate">{e.groupName || t("layers.group")}</span>
                )}
                <span className="text-[11px] text-muted tabular-nums">{members.length}</span>
              </div>
            )}
            <div
              ref={(r) => void (rows.current[i] = r)}
              onPointerDown={(ev) => onDown(ev, i)}
              onPointerMove={onMove}
              onPointerUp={(ev) => onUp(ev, e, sel)}
              onPointerCancel={() => ((drag.current = null), setTarget(null))}
              onContextMenu={(ev) => {
                ev.preventDefault();
                if (!sel) useDesign.getState().select([e.id]);
                openElementMenu({ x: ev.clientX, y: ev.clientY });
              }}
              className={`group flex cursor-default touch-none items-center gap-2 rounded-md px-2 py-1 text-[12px] select-none ${e.groupId ? "ml-3" : ""} ${sel ? "bg-accent/15 text-text" : "hover:bg-panel-2"} ${
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
          </Fragment>
        );
      })}
    </div>
  );
}
