// Drives the design agent from the chat panel (and from "Create with AI" on Home).
import { useChat, type ChatItem } from "../store/chat";
import { useDesign } from "../store/design";
import { localizeMessage, t } from "../i18n";
import { runAgent } from "./agent";
import { aiReady } from "../store/settings";
import { snapshot } from "./versions";

let signal = { cancelled: false };

export async function sendChat(text: string): Promise<void> {
  const chat = useChat.getState();
  if (chat.busy || !text.trim()) return;
  // On an empty page the request is a brief for a new poster.
  if (!(await aiReady())) {
    chat.push({ kind: "user", text: text.trim() });
    chat.push({ kind: "error", text: t("err.noAiKey") });
    return;
  }
  // A version to go back to if the AI's changes are not wanted.
  await snapshot("ai", text).catch(() => {});
  const empty = useDesign.getState().design.elements.length === 0;
  const prompt = empty ? `Design a new poster for this brief:\n\n${text.trim()}` : text.trim();
  const history = [...chat.history, { role: "user" as const, content: [{ type: "text" as const, text: prompt }] }];
  signal = { cancelled: false };
  const mine = signal;
  useChat.setState((s) => ({ busy: true, history, items: [...s.items, { kind: "user", text: text.trim() }] }));

  let streaming: number | null = null;
  const edit = (fn: (items: ChatItem[]) => void) =>
    useChat.setState((s) => {
      const items = [...s.items];
      fn(items);
      return { items };
    });

  try {
    const stop = await runAgent(
      history,
      {
        onText: (delta) =>
          edit((items) => {
            const cur = streaming !== null ? items[streaming] : null;
            if (cur?.kind === "assistant") items[streaming!] = { ...cur, text: cur.text + delta };
            else {
              streaming = items.length;
              items.push({ kind: "assistant", text: delta });
            }
          }),
        onMessage: () => void (streaming = null),
        onTool: (name, input, result, isError) =>
          edit((items) => {
            streaming = null;
            items.push({ kind: "tool", name, input, result, isError });
          }),
      },
      mine,
    );
    if (stop === "max_tokens") useChat.getState().push({ kind: "error", text: t("chat.truncated") });
    else if (stop === "refusal") useChat.getState().push({ kind: "error", text: t("chat.refused") });
  } catch (e) {
    useChat.getState().push({ kind: "error", text: localizeMessage(e instanceof Error ? e.message : String(e)) });
  } finally {
    // The agent extended `history` in place; keep it for follow-up turns.
    useChat.setState({ busy: false, history: [...history] });
    useDesign.getState().select([]);
  }
}

export function cancelChat() {
  signal.cancelled = true;
}
