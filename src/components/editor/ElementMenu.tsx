// Right-click menu for the selection (on the canvas or a layer row), or for
// the page when nothing is under the pointer.
import {
  ArrowDownToLine, ArrowUpToLine, BoxSelect, ChevronDown, ChevronUp, ClipboardPaste, Copy, CopyPlus, Crop, Group, Lock, Pencil, Scissors, Trash2, Ungroup, Unlock,
} from "lucide-react";
import { create } from "zustand";
import { useDesign } from "../../store/design";
import { notifyError, useUi } from "../../store/ui";
import { copyElements, paste } from "../../lib/clipboard";
import { isOneGroup } from "../../lib/groups";
import { shortcut } from "../../lib/platform";
import { useT } from "../../i18n";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { startGroupRename } from "./Layers";

interface MenuAt {
  /** Window position of the menu. */
  x: number;
  y: number;
  /** Page position, where a pasted image lands. */
  at?: { x: number; y: number };
}

const useMenu = create<{ open: MenuAt | null }>()(() => ({ open: null }));
export const openElementMenu = (m: MenuAt) => useMenu.setState({ open: m });
const close = () => useMenu.setState({ open: null });

export function ElementMenu() {
  const t = useT();
  const open = useMenu((s) => s.open);
  const store = useDesign.getState();
  const sel = open ? store.design.elements.filter((e) => store.selected.includes(e.id)) : [];
  const ids = sel.map((e) => e.id);
  const one = sel.length === 1 ? sel[0] : null;
  const locked = sel.length > 0 && sel.every((e) => e.locked);
  const unlocked = sel.filter((e) => !e.locked).map((e) => e.id);

  const pasteItem: MenuItem = { icon: ClipboardPaste, label: t("menu.paste"), hint: shortcut("V"), run: () => void paste(open?.at).catch(notifyError) };
  const items: MenuItem[] = !sel.length
    ? [
        pasteItem,
        { icon: BoxSelect, label: t("menu.selectAll"), hint: shortcut("A"), run: () => store.select(store.design.elements.filter((x) => !x.locked && !x.hidden).map((x) => x.id)) },
      ]
    : [
        { icon: Copy, label: t("menu.copy"), hint: shortcut("C"), run: () => void copyElements(ids) },
        { icon: Scissors, label: t("menu.cut"), hint: shortcut("X"), disabled: !unlocked.length, run: () => (void copyElements(ids), store.remove(unlocked)) },
        pasteItem,
        { icon: CopyPlus, label: t("menu.duplicate"), hint: shortcut("D"), run: () => store.duplicate(ids) },
        ...(one?.type === "text" && !one.locked ? [{ icon: Pencil, label: t("menu.editText"), run: () => useUi.getState().setEditingText(one.id) }] : []),
        ...(one?.type === "image" && !one.locked ? [{ icon: Crop, label: t("crop.action"), run: () => useUi.getState().setCropping(one.id) }] : []),
        "sep",
        ...(sel.length > 1 && !isOneGroup(store.design.elements, ids) ? [{ icon: Group, label: t("insp.groupAction"), hint: shortcut("G"), run: () => store.group(ids) }] : []),
        ...(isOneGroup(store.design.elements, ids) ? [{ icon: Pencil, label: t("layers.rename"), run: () => startGroupRename(sel[0].groupId!) }] : []),
        ...(sel.some((e) => e.groupId) ? [{ icon: Ungroup, label: t("insp.ungroup"), hint: shortcut("G", true), run: () => store.ungroup(ids) }] : []),
        { icon: ArrowUpToLine, label: t("menu.toFront"), hint: shortcut("]", true), run: () => store.reorder(ids, "front") },
        { icon: ChevronUp, label: t("menu.forward"), hint: shortcut("]"), run: () => store.reorder(ids, "forward") },
        { icon: ChevronDown, label: t("menu.backward"), hint: shortcut("["), run: () => store.reorder(ids, "backward") },
        { icon: ArrowDownToLine, label: t("menu.toBack"), hint: shortcut("[", true), run: () => store.reorder(ids, "back") },
        "sep",
        {
          icon: locked ? Unlock : Lock,
          label: t(locked ? "insp.unlock" : "insp.lock"),
          run: () => store.patchMany(sel.map((e) => ({ id: e.id, patch: { locked: locked ? undefined : true } }))),
        },
        { icon: Trash2, label: t("common.delete"), hint: "⌫", danger: true, disabled: !unlocked.length, run: () => store.remove(unlocked) },
      ];
  return <ContextMenu menu={open && { x: open.x, y: open.y, items }} onClose={close} />;
}
