import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, RotateCcw, Sparkles, SquareTerminal } from "lucide-react";
import { ipc } from "../../lib/ipc";
import { useApp } from "../../store/app";
import { useDesign } from "../../store/design";
import { notifyError, useUi } from "../../store/ui";
import { useT } from "../../i18n";
import { Button, IconButton } from "../ui";
import { McpConnect } from "./McpConnect";

const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Plain interactive shell in the linked project folder; the user drives everything typed into it. */
export default function TerminalPanel() {
  const t = useT();
  const visible = useUi((s) => s.terminal);
  const wsId = useDesign((s) => s.design.workspaceId);
  // Designs without a linked project folder open the shell in the home folder.
  const cwd = useApp((s) => s.workspaces.find((w) => w.id === wsId)?.path ?? "");
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const session = useRef<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [exited, setExited] = useState(false);
  const [height, setHeight] = useState(260);
  // The shell keeps its folder when another project opens, so a running Claude Code survives open_project.
  const latestCwd = useRef(cwd);
  latestCwd.current = cwd;
  const [shellCwd, setShellCwd] = useState(cwd);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const xterm = new Terminal({
      fontFamily: '"IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      cursorBlink: true,
      allowProposedApi: true,
      theme: { background: "#15130f", foreground: "#ede6d8", cursor: "#f0a83a", cursorAccent: "#15130f", selectionBackground: "#f0a83a44" },
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(el);
    // Let the app-level Ctrl+` toggle through instead of sending it to the shell.
    xterm.attachCustomKeyEventHandler((e) => !(e.ctrlKey && e.key === "`"));
    fitAddon.fit();
    term.current = xterm;
    fit.current = fitAddon;
    setExited(false);
    setShellCwd(latestCwd.current);

    let disposed = false;
    ipc
      .terminalOpen(latestCwd.current, xterm.cols, xterm.rows, (e) => {
        if (e.type === "data") xterm.write(decode(e.data));
        else setExited(true);
      })
      .then((id) => {
        if (disposed) ipc.terminalClose(id);
        else session.current = id;
      })
      .catch(notifyError);
    const input = xterm.onData((d) => session.current && ipc.terminalWrite(session.current, d).catch(() => {}));
    const resize = xterm.onResize(({ cols, rows }) => session.current && ipc.terminalResize(session.current, cols, rows).catch(() => {}));
    const observer = new ResizeObserver(() => el.offsetParent && fitAddon.fit());
    observer.observe(el);

    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      if (session.current) ipc.terminalClose(session.current);
      session.current = null;
      xterm.dispose();
    };
  }, [generation]);

  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      fit.current?.fit();
      term.current?.focus();
    });
  }, [visible, height]);

  const runClaude = () => {
    if (!session.current) return;
    // Only types the command: the user presses Enter and runs Claude Code themselves.
    ipc.terminalWrite(session.current, "claude").catch(notifyError);
    term.current?.focus();
  };

  const startDrag = (e: ReactPointerEvent) => {
    const startY = e.clientY;
    const start = height;
    const move = (ev: PointerEvent) => setHeight(Math.min(window.innerHeight * 0.7, Math.max(140, start + startY - ev.clientY)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className={`relative shrink-0 flex-col border-t border-line bg-bg ${visible ? "flex" : "hidden"}`} style={{ height }}>
      <div className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize" onPointerDown={startDrag} />
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <SquareTerminal size={14} className="text-muted" />
        <span className="text-[12px] font-medium">{t("terminal.title")}</span>
        <span className="truncate text-[11px] text-muted">{shellCwd}</span>
        <div className="flex-1" />
        <McpConnect />
        <Button variant="ghost" className="py-1" onClick={runClaude} disabled={exited} title={t("terminal.runClaudeHint")}>
          <Sparkles size={13} /> {t("terminal.runClaude")}
        </Button>
        <IconButton title={t("terminal.restart")} onClick={() => setGeneration((g) => g + 1)}><RotateCcw size={14} /></IconButton>
        <IconButton title={t("terminal.hide")} onClick={() => useUi.getState().toggleTerminal()}><ChevronDown size={16} /></IconButton>
      </div>
      <div className="relative min-h-0 flex-1 select-text px-2 pt-1">
        <div ref={host} className="h-full w-full" />
        {exited && (
          <div className="absolute inset-x-0 bottom-2 text-center text-[11px] text-muted">{t("terminal.exited")}</div>
        )}
      </div>
    </div>
  );
}
