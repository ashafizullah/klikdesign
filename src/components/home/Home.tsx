// Start screen: create with AI, start from a size or template, and recent designs.
import { useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { FolderGit2, FolderPlus, KeyRound, Loader2, Plus, Sparkles, Trash2, Unlink } from "lucide-react";
import logo from "../../assets/logo.png";
import { SIZE_PRESETS } from "../../types/design";
import { useApp } from "../../store/app";
import { notifyError, useUi } from "../../store/ui";
import { createDesign, openDesign } from "../../lib/library";
import { sendChat } from "../../lib/chat";
import { ipc } from "../../lib/ipc";
import { TEMPLATES } from "../../lib/templates";
import { formatMB } from "../../lib/format";
import { useT } from "../../i18n";
import { Button, IconButton } from "../ui";
import { LanguageToggle } from "../ui/LanguageToggle";
import { ModelPicker } from "../ui/ModelPicker";
import { ProjectPicker } from "../ui/ProjectPicker";
import { addWorkspace } from "../../lib/workspace";
import { TemplateThumb } from "../editor/LeftPanel";

export function Home() {
  const t = useT();
  const designs = useApp((s) => s.designs);
  const workspaces = useApp((s) => s.workspaces);
  const [wsId, setWsId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(SIZE_PRESETS[0].id);
  const [busy, setBusy] = useState(false);

  useEffect(() => void useApp.getState().refresh().catch(notifyError), []);

  const preset = (id: string) => SIZE_PRESETS.find((p) => p.id === id)!;

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const p = preset(size);
      await createDesign({ width: p.width, height: p.height, name: prompt.trim().slice(0, 40), workspaceId: wsId });
      useUi.getState().setRightTab("ai");
      void sendChat(prompt);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (id: string, name: string) => {
    if (!(await ask(t("ws.removeConfirm", { name }), { kind: "warning" }))) return;
    await ipc.workspaceRemove(id).catch(notifyError);
    if (wsId === id) setWsId(null);
    void useApp.getState().refresh();
  };

  const remove = async (id: string, name: string) => {
    if (!(await ask(t("home.deleteConfirm", { name }), { kind: "warning" }))) return;
    await ipc.designDelete(id).catch(notifyError);
    void useApp.getState().refresh();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-4" data-tauri-drag-region>
        <img src={logo} alt="" className="h-7 w-7" draggable={false} />
        <span className="text-[14px] font-semibold">KlikDesign</span>
        <div className="flex-1" />
        <LanguageToggle />
        <Button variant="ghost" onClick={() => useUi.getState().open("settings")}><KeyRound size={14} /> {t("home.aiSettings")}</Button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
          <section className="rounded-2xl border border-line bg-gradient-to-br from-accent-2/25 via-panel to-accent/10 p-6">
            <h1 className="flex items-center gap-2 text-[22px] font-semibold"><Sparkles size={20} className="text-accent" /> {t("home.aiTitle")}</h1>
            <p className="mt-1 text-[12px] text-muted">{t("home.aiSub")}</p>
            <textarea
              className="field mt-4 min-h-24 resize-none text-[13px]"
              placeholder={t("home.aiPlaceholder")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
              }}
            />
            <div className="mt-3 w-full max-w-md">
              <ProjectPicker value={wsId} onChange={setWsId} />
              <p className="mt-1 text-[11px] text-muted">{t(wsId ? "ws.hintOn" : "ws.hintOff")}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select className="field w-56" value={size} onChange={(e) => setSize(e.target.value)}>
                {SIZE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{t(`size.${p.id}` as "size.custom")} · {p.width}×{p.height}</option>
                ))}
              </select>
              <div className="w-64"><ModelPicker /></div>
              <div className="flex-1" />
              <Button variant="primary" disabled={!prompt.trim() || busy} onClick={generate}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {t("home.generate")}
              </Button>
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-[13px] font-semibold">{t("ws.title")}</h2>
            <p className="mb-3 text-[11px] text-muted">{t("ws.sub")}</p>
            <div className="flex flex-wrap gap-2">
              {workspaces.map((w) => (
                <div
                  key={w.id}
                  className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${wsId === w.id ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-muted"}`}
                >
                  <button className="flex items-center gap-2" title={w.path} onClick={() => setWsId(wsId === w.id ? null : w.id)}>
                    <FolderGit2 size={14} className={wsId === w.id ? "text-accent" : "text-muted"} />
                    <span className="max-w-48 truncate">{w.name}</span>
                  </button>
                  <button className="text-muted opacity-0 group-hover:opacity-100 hover:text-danger" title={t("ws.remove")} onClick={() => unlink(w.id, w.name).catch(notifyError)}>
                    <Unlink size={12} />
                  </button>
                </div>
              ))}
              <button
                className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-[12px] text-muted hover:border-accent hover:text-text"
                onClick={() => addWorkspace().then((w) => w && setWsId(w.id)).catch(notifyError)}
              >
                <FolderPlus size={14} /> {t("ws.add")}
              </button>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[13px] font-semibold">{t("home.blank")}</h2>
            <div className="flex flex-wrap gap-3">
              {SIZE_PRESETS.map((p) => {
                const k = 64 / Math.max(p.width, p.height);
                return (
                  <button
                    key={p.id}
                    onClick={() => createDesign({ width: p.width, height: p.height }).catch(notifyError)}
                    className="flex w-32 flex-col items-center gap-2 rounded-xl border border-line bg-panel p-3 hover:border-accent"
                  >
                    <div className="flex h-16 items-center justify-center">
                      <div className="flex items-center justify-center rounded-sm border border-muted/60 bg-panel-2" style={{ width: p.width * k, height: p.height * k }}>
                        <Plus size={14} className="text-muted" />
                      </div>
                    </div>
                    <span className="text-[11px]">{t(`size.${p.id}` as "size.custom")}</span>
                    <span className="-mt-1.5 text-[10px] text-muted">{p.width}×{p.height}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[13px] font-semibold">{t("home.templates")}</h2>
            <div className="grid grid-cols-4 gap-4">
              {TEMPLATES.map((tpl) => (
                <button key={tpl.id} className="group text-left" onClick={() => createDesign({ ...structuredClone(tpl.design), name: t(tpl.name) } as never).catch(notifyError)}>
                  <div className="flex h-60 items-center justify-center rounded-xl border border-line bg-panel p-4 group-hover:border-accent">
                    <div className="h-full max-w-full" style={{ aspectRatio: `${tpl.design.width}/${tpl.design.height}` }}>
                      <TemplateThumb tpl={tpl} />
                    </div>
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted group-hover:text-text">{t(tpl.name)}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[13px] font-semibold">{t("home.recent")}</h2>
            {designs.length === 0 ? (
              <p className="text-[12px] text-muted">{t("home.noDesigns")}</p>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                {designs.map((d) => (
                  <div key={d.id} className="group relative">
                    <button onClick={() => openDesign(d.id)} className="block w-full text-left">
                      <div className="checker-soft flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-line p-3 group-hover:border-accent">
                        {d.thumb ? (
                          <img src={d.thumb} alt="" className="max-h-full max-w-full shadow-lg" draggable={false} />
                        ) : (
                          <div className="bg-white/90" style={{ aspectRatio: `${d.width}/${d.height}`, height: "80%" }} />
                        )}
                      </div>
                      <div className="mt-1.5 truncate text-[12px]">{d.name || t("home.untitled")}</div>
                      <div className="text-[10px] text-muted">{d.width}×{d.height} · {new Date(d.updatedAt).toLocaleDateString()} · {formatMB(d.size)}</div>
                      {d.workspaceId && workspaces.some((w) => w.id === d.workspaceId) && (
                        <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-accent">
                          <FolderGit2 size={10} /> {workspaces.find((w) => w.id === d.workspaceId)!.name}
                        </div>
                      )}
                    </button>
                    <IconButton
                      title={t("common.delete")}
                      className="absolute top-2 right-2 bg-panel/90 opacity-0 group-hover:opacity-100 hover:text-danger"
                      onClick={() => remove(d.id, d.name).catch(notifyError)}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
