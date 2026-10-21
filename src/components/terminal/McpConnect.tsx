import { useState } from "react";
import { Check, Copy, Plug } from "lucide-react";
import { addCommand, useMcp, useMcpLink } from "../../lib/mcp";
import { notifyError, useUi } from "../../store/ui";
import { useT } from "../../i18n";
import { Button } from "../ui";

/** Lets the user add KlikReel's MCP server to their own Claude Code; the app only shows the command. */
export function McpConnect() {
  const t = useT();
  const { enabled, info, setEnabled } = useMcp();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = useMcpLink();
  const copy = async () => {
    if (!info) return;
    await navigator.clipboard.writeText(addCommand(info));
    setCopied(true);
    useUi.getState().notify(t("mcp.copied"));
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative">
      <Button variant="ghost" className={`py-1 ${link?.running ? "text-green-400" : ""}`} onClick={() => setOpen((o) => !o)}>
        <Plug size={13} /> {link?.connected ? t("mcp.connected") : t("mcp.button")}
      </Button>
      {open && (
        <div className="absolute right-0 bottom-full z-30 mb-2 w-[420px] rounded-lg border border-line bg-panel-2 p-3 text-[12px] shadow-xl">
          <div className="mb-1 font-medium">{t("mcp.title")}</div>
          <p className="mb-3 text-muted">{t("mcp.body")}</p>
          <label className="mb-3 flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked).catch(notifyError)} />
            {t("mcp.enable")}
          </label>
          {info && (
            <>
              <div className={`mb-3 flex items-center gap-2 rounded-md border px-2 py-1.5 ${link?.connected ? "border-green-500/50 bg-green-500/15 text-green-400" : "border-green-500/30 text-green-400/80"}`}>
                <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                {link?.connected ? t("mcp.connectedTitle", { client: link.client ?? "Claude Code" }) : t("mcp.waitingTitle")}
              </div>
              <div className="label">{t("mcp.step1")}</div>
              <div className="mb-1 flex items-start gap-2">
                <code className="block min-w-0 flex-1 rounded-md border border-line bg-bg p-2 font-mono text-[11px] break-all select-text">
                  {addCommand({ ...info, token: "•".repeat(12) })}
                </code>
                <Button onClick={() => copy().catch(notifyError)}>{copied ? <Check size={13} /> : <Copy size={13} />}</Button>
              </div>
              <p className="mb-3 text-[11px] text-muted">{t("mcp.secret")}</p>
              <div className="label">{t("mcp.step2")}</div>
              <p className="text-muted">{t("mcp.step2Body")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
