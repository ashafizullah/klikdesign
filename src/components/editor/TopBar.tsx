import { ArrowLeft, Download, KeyRound, Maximize, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { useStore } from "zustand";
import logo from "../../assets/logo.png";
import { redo, undo, useDesign } from "../../store/design";
import { useUi } from "../../store/ui";
import { useApp } from "../../store/app";
import { closeDesign } from "../../lib/library";
import { useT } from "../../i18n";
import { Button, IconButton } from "../ui";
import { LanguageToggle } from "../ui/LanguageToggle";

export function TopBar() {
  const t = useT();
  const name = useDesign((s) => s.design.name);
  const dirty = useDesign((s) => s.dirty);
  const wsId = useDesign((s) => s.design.workspaceId);
  const ws = useApp((s) => s.workspaces.find((w) => w.id === wsId));
  const canUndo = useStore(useDesign.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useDesign.temporal, (s) => s.futureStates.length > 0);
  const zoom = useUi((s) => s.zoom ?? s.fitZoom);
  const setZoom = useUi((s) => s.setZoom);
  const open = useUi((s) => s.open);
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3" data-tauri-drag-region>
      <IconButton title={t("top.back")} onClick={closeDesign}><ArrowLeft size={16} /></IconButton>
      <img src={logo} alt="" className="h-7 w-7" draggable={false} />
      {ws && (
        <>
          <span className="max-w-40 truncate text-[12px] text-muted" title={ws.path}>{ws.name}</span>
          <span className="text-muted">/</span>
        </>
      )}
      <input
        className="w-64 rounded-md bg-transparent px-2 py-1 text-[13px] font-medium outline-none hover:bg-panel-2 focus:bg-panel-2"
        value={name}
        onChange={(e) => useDesign.getState().update((d) => void (d.name = e.target.value))}
      />
      <span className="text-[11px] text-muted">{dirty ? t("top.saving") : t("top.saved")}</span>
      <div className="mx-2 h-5 w-px bg-line" />
      <IconButton title={t("top.undo")} disabled={!canUndo} onClick={undo}><Undo2 size={15} /></IconButton>
      <IconButton title={t("top.redo")} disabled={!canRedo} onClick={redo}><Redo2 size={15} /></IconButton>
      <div className="flex-1" />
      <div className="flex items-center rounded-md border border-line">
        <IconButton title={t("top.zoomOut")} onClick={() => setZoom(zoom / 1.2)}><Minus size={14} /></IconButton>
        <button className="w-12 text-center text-[11px] text-muted tabular-nums hover:text-text" title={t("top.zoomFit")} onClick={() => setZoom(null)}>
          {Math.round(zoom * 100)}%
        </button>
        <IconButton title={t("top.zoomIn")} onClick={() => setZoom(zoom * 1.2)}><Plus size={14} /></IconButton>
        <IconButton title={t("top.zoomFit")} onClick={() => setZoom(null)}><Maximize size={13} /></IconButton>
      </div>
      <div className="flex-1" />
      <LanguageToggle />
      <Button variant="ghost" onClick={() => open("settings")}><KeyRound size={14} /> {t("home.aiSettings")}</Button>
      <Button variant="primary" onClick={() => open("export")}><Download size={14} /> {t("top.export")}</Button>
    </header>
  );
}
