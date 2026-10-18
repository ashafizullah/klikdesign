// Provider-neutral tool-use loop shared by the editing agent and the producer.
import { activeModel } from "../store/settings";
import type { Message, Part, ToolDef } from "./ipc";
import { ipc } from "./ipc";

export type ToolArgs = Record<string, unknown>;

/** A tool result that also shows the model an image (sent after the tool results). */
export class WithImage {
  constructor(
    public content: string,
    public image: { mediaType: string; data: string },
  ) {}
}

export interface LoopOptions {
  system: string;
  history: Message[];
  tools: ToolDef[];
  exec(name: string, input: ToolArgs): Promise<unknown>;
  maxSteps?: number;
  signal?: { cancelled: boolean };
  /** Checked after each round of tool calls; true ends the loop. */
  done?(): boolean;
  onText?(delta: string): void;
  onMessage?(m: Message): void;
  onTool?(name: string, input: ToolArgs, result: string, isError: boolean): void;
}

/** Runs until the model stops calling tools. `history` is extended in place. */
export async function runToolLoop(o: LoopOptions): Promise<string> {
  for (let step = 0; step < (o.maxSteps ?? 12); step++) {
    if (o.signal?.cancelled) return "cancelled";
    const res = await ipc.chat({ ...activeModel(), system: o.system, messages: o.history, tools: o.tools }, o.onText);
    // Never run tools from a truncated or refused turn: inputs may be incomplete. Drop
    // its tool calls too, or every later request fails on calls without results.
    const stopped = res.stopReason === "refusal" || res.stopReason === "max_tokens";
    const message = stopped ? { ...res.message, content: res.message.content.filter((p) => p.type !== "toolCall") } : res.message;
    if (message.content.length) {
      o.history.push(message);
      o.onMessage?.(message);
    }
    if (stopped) return res.stopReason;
    const calls = res.message.content.filter((p): p is Extract<Part, { type: "toolCall" }> => p.type === "toolCall");
    if (calls.length === 0) return res.stopReason;
    const results: Part[] = [];
    const images: Part[] = [];
    for (const call of calls) {
      let content: string;
      let isError = false;
      try {
        if ("__invalid_json" in call.input) throw new Error("tool arguments were not valid JSON; send them again");
        const out = await o.exec(call.name, call.input);
        if (out instanceof WithImage) {
          content = out.content;
          images.push({ type: "image", ...out.image });
        } else content = typeof out === "string" ? out : JSON.stringify(out);
      } catch (e) {
        content = e instanceof Error ? e.message : String(e);
        isError = true;
      }
      o.onTool?.(call.name, call.input, content, isError);
      results.push({ type: "toolResult", id: call.id, name: call.name, content, isError });
    }
    const turn: Message = { role: "user", content: [...results, ...images] };
    o.history.push(turn);
    o.onMessage?.(turn);
    if (o.done?.()) return "done";
  }
  return "max_steps";
}
