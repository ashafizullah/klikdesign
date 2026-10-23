// AI design chat: describe a poster on an empty page, or ask for changes.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, FolderGit2, Loader2, Send, Sparkles, Square, Trash2, Wrench } from "lucide-react";
import { useChat } from "../../store/chat";
import { useDesign } from "../../store/design";
import { cancelChat, sendChat } from "../../lib/chat";
import { useApp } from "../../store/app";
import { useT, type Key } from "../../i18n";
import { Button, IconButton } from "../ui";
import { ModelPicker } from "../ui/ModelPicker";
import { Markdown } from "../ui/Markdown";

const TOOL_LABELS: Record<string, Key> = {
  get_design: "tool.get_design",
  rename_design: "tool.rename_design",
  list_design_images: "tool.list_design_images",
  view_design_image: "tool.view_design_image",
  place_design_image: "tool.place_design_image",
  list_installed_fonts: "tool.list_installed_fonts",
  set_canvas: "tool.set_canvas",
  clear_design: "tool.clear_design",
  add_elements: "tool.add_elements",
  update_elements: "tool.update_elements",
  remove_elements: "tool.remove_elements",
  reorder: "tool.reorder",
  view_design: "tool.view_design",
  list_files: "tool.list_files",
  read_file: "tool.read_file",
  search_code: "tool.search_code",
  list_project_images: "tool.list_project_images",
  view_project_image: "tool.view_project_image",
  place_project_image: "tool.place_project_image",
};

/** Detail shown after a tool label (file, query or image path). */
const toolDetail = (input: Record<string, unknown>) => String(input.path ?? input.query ?? input.dir ?? "");

export function ChatPanel() {
  const t = useT();
  const items = useChat((s) => s.items);
  const busy = useChat((s) => s.busy);
  const empty = useDesign((s) => s.design.elements.length === 0);
  const workspaceId = useDesign((s) => s.design.workspaceId);
  const ws = useApp((s) => s.workspaces.find((w) => w.id === workspaceId));
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [items]);

  const send = (value = text) => {
    if (!value.trim() || busy) return;
    setText("");
    void sendChat(value);
  };

  const suggestions: Key[] = empty ? ["chat.s.new1", "chat.s.new2", "chat.s.new3"] : ["chat.s.edit1", "chat.s.edit2", "chat.s.edit3"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-line p-3">
        <div className="min-w-0 flex-1"><ModelPicker /></div>
        <IconButton title={t("chat.clear")} disabled={busy || !items.length} onClick={() => useChat.getState().reset()}><Trash2 size={14} /></IconButton>
      </div>
      {ws && (
        <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-[11px] text-accent" title={ws.path}>
          <FolderGit2 size={13} className="shrink-0" /> <span className="truncate">{t("chat.readsFolder", { name: ws.name })}</span>
        </div>
      )}
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {items.length === 0 && (
          <div className="space-y-3 py-4 text-center">
            <Sparkles className="mx-auto text-accent-2" size={22} />
            <p className="text-[12px] leading-relaxed text-muted">{t(empty ? "chat.introEmpty" : "chat.intro")}</p>
            {ws && <p className="text-[11px] leading-relaxed text-accent">{t("chat.introProject")}</p>}
            <div className="space-y-1.5">
              {suggestions.map((k) => (
                <button key={k} onClick={() => send(t(k))} className="block w-full rounded-md border border-line bg-panel-2 px-2.5 py-2 text-left text-[11px] text-muted hover:border-accent hover:text-text">
                  {t(k)}
                </button>
              ))}
            </div>
          </div>
        )}
        {items.map((it, i) => {
          if (it.kind === "user") return <div key={i} className="ml-6 rounded-lg bg-accent-2/20 px-3 py-2 text-[12px] whitespace-pre-wrap select-text">{it.text}</div>;
          if (it.kind === "assistant") return <Markdown key={i} text={it.text} className="mr-4 text-[12px] leading-relaxed select-text" />;
          if (it.kind === "error")
            return (
              <div key={i} className="flex gap-1.5 rounded-md bg-danger/10 px-2.5 py-2 text-[11px] text-danger">
                <AlertTriangle size={13} className="mt-px shrink-0" /> <span className="whitespace-pre-wrap select-text">{it.text}</span>
              </div>
            );
          return (
            <div key={i} className={`flex items-center gap-1.5 text-[11px] ${it.isError ? "text-danger" : "text-muted"}`} title={it.isError ? it.result : undefined}>
              {it.isError ? <AlertTriangle size={12} /> : READ_ONLY.has(it.name) ? <Wrench size={12} className="shrink-0" /> : <Check size={12} className="text-accent" />}
              <span className="min-w-0 truncate">
                {TOOL_LABELS[it.name] ? t(TOOL_LABELS[it.name], { n: toolCount(it.input) }) : it.name}
                {toolDetail(it.input) && <span className="ml-1 font-mono text-[10px] opacity-70">{toolDetail(it.input)}</span>}
              </span>
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <Loader2 size={12} className="animate-spin" /> {t("chat.working")}
          </div>
        )}
      </div>
      <div className="border-t border-line p-3">
        <textarea
          className="field min-h-20 resize-none"
          placeholder={t(empty ? "chat.placeholderEmpty" : "chat.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="mt-2 flex justify-end">
          {busy ? (
            <Button variant="danger" onClick={cancelChat}><Square size={12} /> {t("chat.stop")}</Button>
          ) : (
            <Button variant="primary" disabled={!text.trim()} onClick={() => send()}>
              {empty ? <Sparkles size={13} /> : <Send size={13} />} {t(empty ? "chat.generate" : "chat.send")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const READ_ONLY = new Set(["get_design", "view_design", "list_files", "read_file", "search_code", "list_project_images", "view_project_image", "list_design_images", "view_design_image", "list_installed_fonts"]);

function toolCount(input: Record<string, unknown>): number {
  const arr = input.elements ?? input.updates ?? input.ids;
  return Array.isArray(arr) ? arr.length : 1;
}
