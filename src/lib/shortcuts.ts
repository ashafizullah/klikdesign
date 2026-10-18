import { useEffect } from "react";
import type { El } from "../types/design";
import { redo, undo, useDesign } from "../store/design";
import { notifyError, useUi } from "../store/ui";
import { useApp } from "../store/app";
import { saveNow } from "./library";

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/** In-app clipboard for copy/paste of elements. */
let clipboard: El[] = [];

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (useApp.getState().view !== "editor") return;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow().catch(notifyError);
        return;
      }
      if (typing(e) || useUi.getState().dialog || useUi.getState().editingTextId) return;
      const store = useDesign.getState();
      const sel = store.selected;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") return void (e.preventDefault(), redo());
      if (mod && key === "a") return void (e.preventDefault(), store.select(store.design.elements.filter((x) => !x.locked && !x.hidden).map((x) => x.id)));
      if (mod && key === "c" && sel.length) return void (clipboard = structuredClone(store.design.elements.filter((x) => sel.includes(x.id))));
      if (mod && key === "x" && sel.length) {
        clipboard = structuredClone(store.design.elements.filter((x) => sel.includes(x.id)));
        return void store.remove(sel);
      }
      if (mod && key === "v" && clipboard.length) {
        e.preventDefault();
        store.add(clipboard.map(({ id: _id, ...x }) => ({ ...structuredClone(x), x: x.x + 24, y: x.y + 24, locked: undefined })));
        clipboard = clipboard.map((x) => ({ ...x, x: x.x + 24, y: x.y + 24 }));
        return;
      }
      if (mod && key === "d" && sel.length) return void (e.preventDefault(), store.duplicate(sel));
      if (mod && (e.key === "]" || e.key === "[") && sel.length) {
        e.preventDefault();
        return store.reorder(sel, e.key === "]" ? (e.shiftKey ? "front" : "forward") : e.shiftKey ? "back" : "backward");
      }
      if ((mod && (e.key === "=" || e.key === "+")) || (mod && e.key === "-")) {
        e.preventDefault();
        const ui = useUi.getState();
        const z = ui.zoom ?? ui.fitZoom;
        return ui.setZoom(e.key === "-" ? z / 1.2 : z * 1.2);
      }
      if (mod && e.key === "0") return void (e.preventDefault(), useUi.getState().setZoom(null));
      switch (e.key) {
        case "Delete":
        case "Backspace": {
          const ids = store.design.elements.filter((x) => sel.includes(x.id) && !x.locked).map((x) => x.id);
          if (ids.length) store.remove(ids);
          break;
        }
        case "Escape":
          store.select([]);
          break;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (!sel.length) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          store.patchMany(store.design.elements.filter((x) => sel.includes(x.id) && !x.locked).map((x) => ({ id: x.id, patch: { x: x.x + dx, y: x.y + dy } })));
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
