import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { redo, undo, useDesign } from "../store/design";
import { notifyError, useUi } from "../store/ui";
import { useApp } from "../store/app";
import { saveNow } from "./library";
import { copyElements, paste } from "./clipboard";

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

const TEXT_INPUTS = new Set(["text", "search", "url", "email", "password", ""]);

/** A field with its own text undo (a text box, the chat), as opposed to a number field, slider, checkbox or select. */
function editingText(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "TEXTAREA" || el.isContentEditable) return true;
  return el instanceof HTMLInputElement && TEXT_INPUTS.has(el.getAttribute("type") ?? "");
}

/** Undo or redo the design, unless a text field that undoes its own typing has the focus. */
function undoOrRedo(again: boolean) {
  const focused = document.activeElement;
  if (editingText(focused)) return void document.execCommand(again ? "redo" : "undo");
  if (useApp.getState().view !== "editor" || useUi.getState().dialog) return;
  // A number field commits its edit on blur, so that edit is what gets undone.
  if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
  if (again) redo();
  else undo();
}

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
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        useUi.getState().toggleTerminal();
        return;
      }
      // Undo works from anywhere in the editor except fields that undo their own text.
      const key = e.key.toLowerCase();
      if (mod && (key === "z" || key === "y") && !editingText(e.target) && !useUi.getState().dialog) {
        e.preventDefault();
        return undoOrRedo(key === "y" || e.shiftKey);
      }
      if (typing(e) || useUi.getState().dialog || useUi.getState().editingTextId) return;
      if (useUi.getState().croppingId) {
        if (e.key === "Escape" || e.key === "Enter") useUi.getState().setCropping(null);
        return;
      }
      const store = useDesign.getState();
      const sel = store.selected;
      if (mod && key === "a") return void (e.preventDefault(), store.select(store.design.elements.filter((x) => !x.locked && !x.hidden).map((x) => x.id)));
      if (mod && key === "c" && sel.length) return void copyElements(sel);
      if (mod && key === "x" && sel.length) {
        void copyElements(sel);
        return void store.remove(sel);
      }
      if (mod && key === "v") return void (e.preventDefault(), paste().catch(notifyError));
      if (mod && key === "g") {
        e.preventDefault();
        if (e.shiftKey) store.ungroup(sel);
        else if (sel.length > 1) store.group(sel);
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
    // On macOS ⌘Z/⇧⌘Z also arrive from the Edit menu (when the webview passes the key on, or the menu is clicked).
    const unlisten = listen<string>("menu-edit", (e) => undoOrRedo(e.payload === "redo")).catch(() => () => {});
    return () => {
      window.removeEventListener("keydown", onKey);
      void unlisten.then((fn) => fn());
    };
  }, []);
}
