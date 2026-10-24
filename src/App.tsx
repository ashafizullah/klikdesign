import { lazy, Suspense, useEffect, useState } from "react";
import { Home } from "./components/home/Home";
import { TopBar } from "./components/editor/TopBar";
import { LeftPanel } from "./components/editor/LeftPanel";
import { Canvas } from "./components/editor/Canvas";
import { PageStrip } from "./components/editor/PageStrip";
import { RightPanel } from "./components/editor/RightPanel";
import { SettingsDialog } from "./components/dialogs/SettingsDialog";
import { ExportDialog } from "./components/dialogs/ExportDialog";
import { UpdateDialog } from "./components/dialogs/UpdateDialog";
import { ConfirmDialog } from "./components/dialogs/ConfirmDialog";
import { ResizeDialog } from "./components/dialogs/ResizeDialog";
import { HistoryDialog } from "./components/dialogs/HistoryDialog";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { TooltipLayer } from "./components/ui/TooltipLayer";
import { useUi } from "./store/ui";
import { useApp } from "./store/app";
import { useShortcuts } from "./lib/shortcuts";
import { useT } from "./i18n";
import { loadSystemFonts } from "./lib/fonts";
import "./lib/mcp";

const TerminalPanel = lazy(() => import("./components/terminal/TerminalPanel"));

/** Starts the shell only once the panel is first opened; it lives until the design closes. */
function TerminalSlot() {
  const visible = useUi((s) => s.terminal);
  const [started, setStarted] = useState(visible);
  useEffect(() => {
    if (visible) setStarted(true);
  }, [visible]);
  return started ? (
    <Suspense fallback={null}>
      <TerminalPanel />
    </Suspense>
  ) : null;
}

export default function App() {
  useShortcuts();
  useEffect(() => void loadSystemFonts(), []);
  const t = useT();
  const view = useApp((s) => s.view);
  const dialog = useUi((s) => s.dialog);
  const toast = useUi((s) => s.toast);
  return (
    <div className="flex h-full flex-col">
      {view === "home" ? (
        <ErrorBoundary name={t("panel.home")}><Home /></ErrorBoundary>
      ) : (
        <>
          <TopBar />
          <div className="flex min-h-0 flex-1">
            <ErrorBoundary name={t("panel.assets")}><LeftPanel /></ErrorBoundary>
            <div className="flex min-w-0 flex-1 flex-col">
              <ErrorBoundary name={t("panel.canvas")}><Canvas /></ErrorBoundary>
              <PageStrip />
            </div>
            <RightPanel />
          </div>
          <ErrorBoundary name={t("panel.terminal")}><TerminalSlot /></ErrorBoundary>
        </>
      )}
      {dialog === "settings" && <SettingsDialog />}
      {dialog === "export" && <ExportDialog />}
      {dialog === "resize" && <ResizeDialog />}
      {dialog === "history" && <HistoryDialog />}
      <UpdateDialog />
      <ConfirmDialog />
      <TooltipLayer />
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[60] max-w-xl -translate-x-1/2 rounded-lg border px-4 py-2 text-[12px] whitespace-pre-wrap shadow-xl ${
            toast.kind === "error" ? "border-danger/50 bg-[#2a1512] text-danger" : "border-line bg-panel-2 text-text"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
