import { useState } from "react";
import { Check, Copy, Plug } from "lucide-react";
import { agentCommand, agentName, setupSnippet, useMcp, useMcpLink, type McpClient } from "../../lib/mcp";
import { notifyError, useUi } from "../../store/ui";
import { useT } from "../../i18n";
import { Button } from "../ui";

const CLIENTS: { id: McpClient; label: string }[] = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "other", label: "Other" },
];

/** Lets the user add KlikDesign's MCP server to their own agent; the app only shows the command or config. */
export function McpConnect() {
  const t = useT();
  const { enabled, client, info, setEnabled, setClient } = useMcp();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = useMcpLink();
  const command = agentCommand(client);
  const copy = async () => {
    if (!info) return;
    await navigator.clipboard.writeText(setupSnippet(client, info));
    setCopied(true);
    useUi.getState().notify(t("mcp.copied"));
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative">
      <Button variant="ghost" className={`py-1 ${link?.running ? "text-ok" : ""}`} onClick={() => setOpen((o) => !o)}>
        <Plug size={13} /> {link?.connected ? t("mcp.connected", { client: agentName(link.client) }) : t("mcp.button")}
      </Button>
      {open && (
        <div className="absolute right-0 bottom-full z-50 mb-2 w-[440px] rounded-lg border border-line bg-panel-2 p-3 text-[12px] shadow-xl">
          <div className="mb-1 font-medium">{t("mcp.title")}</div>
          <p className="mb-3 text-muted">{t("mcp.body")}</p>
          <label className="mb-3 flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked).catch(notifyError)} />
            {t("mcp.enable")}
          </label>
          {info && (
            <>
              <div className={`mb-3 flex items-center gap-2 rounded-md border px-2 py-1.5 ${link?.connected ? "border-ok/50 bg-ok/15 text-ok" : "border-ok/30 text-ok/80"}`}>
                <span className="h-2 w-2 shrink-0 rounded-full bg-ok" />
                {link?.connected ? t("mcp.connectedTitle", { client: link.client ?? "MCP" }) : t("mcp.waitingTitle")}
              </div>
              <div className="mb-3 flex overflow-hidden rounded-md border border-line text-[11px]">
                {CLIENTS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setClient(c.id)}
                    className={`flex-1 px-2 py-1 ${client === c.id ? "bg-bg text-accent" : "text-muted hover:text-text"}`}
                  >
                    {c.id === "other" ? t("mcp.other") : c.label}
                  </button>
                ))}
              </div>
              <div className="label">{t(client === "claude" ? "mcp.step1" : client === "codex" ? "mcp.step1Codex" : "mcp.step1Other")}</div>
              <div className="mb-1 flex items-start gap-2">
                <code className="block min-w-0 flex-1 rounded-md border border-line bg-bg p-2 font-mono text-[11px] break-all whitespace-pre-wrap select-text">
                  {setupSnippet(client, { ...info, token: "•".repeat(12) })}
                </code>
                <Button onClick={() => copy().catch(notifyError)}>{copied ? <Check size={13} /> : <Copy size={13} />}</Button>
              </div>
              <p className="mb-3 text-[11px] text-muted">{t("mcp.secret")}</p>
              <div className="label">{t("mcp.step2")}</div>
              <p className="text-muted">{command ? t("mcp.step2Body", { command }) : t("mcp.step2Other")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
