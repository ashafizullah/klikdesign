import { useMcpLink } from "../../lib/mcp";
import { useUi } from "../../store/ui";
import { useT } from "../../i18n";

/** Top-bar status of the MCP link: green once the user's Claude Code is connected. */
export function McpBadge() {
  const t = useT();
  const link = useMcpLink();
  if (!link?.running) return null;
  const title = link.connected ? t("mcp.connectedTitle", { client: link.client ?? "Claude Code" }) : t("mcp.waitingTitle");
  return (
    <button
      title={title}
      aria-label={title}
      onClick={() => !useUi.getState().terminal && useUi.getState().toggleTerminal()}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition ${
        link.connected ? "border-green-500/50 bg-green-500/15 text-green-400" : "border-green-500/30 text-green-400/80 hover:text-green-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-green-500 ${link.connected ? "shadow-[0_0_6px] shadow-green-500" : ""}`} />
      {link.connected ? t("mcp.connected") : t("mcp.waiting")}
    </button>
  );
}
