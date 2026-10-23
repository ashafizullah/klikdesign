// Start screen, laid out like KlikReel: workspaces (linked project folders) on
// the left, the selected workspace's designs on the right. Designs made in a
// workspace are linked to its folder, so the AI researches that codebase.
import { useCallback, useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { ExternalLink, Folder, FolderOpen, FolderPlus, Inbox, KeyRound, Loader2, Palette, Pencil, Plus, RefreshCw, Sparkles, Trash2, Unlink } from "lucide-react";
import logo from "../../assets/logo.png";
import { SIZE_PRESETS } from "../../types/design";
import { NO_WORKSPACE, groupOf, useApp } from "../../store/app";
import { confirm, notifyError, useUi } from "../../store/ui";
import { createDesign, openDesign } from "../../lib/library";
import { sendChat } from "../../lib/chat";
import { ipc, type DesignMeta, type Workspace } from "../../lib/ipc";
import { TEMPLATES } from "../../lib/templates";
import { addWorkspace } from "../../lib/workspace";
import { checkForUpdate, useUpdate } from "../../lib/updater";
import { formatMB } from "../../lib/format";
import { useLocale, useT } from "../../i18n";
import { Button, Modal } from "../ui";
import { LanguageToggle } from "../ui/LanguageToggle";
import { ModelPicker } from "../ui/ModelPicker";
import { SizeTiles } from "../ui/SizeTiles";
import { BrandKitEditor } from "../editor/BrandKit";
import { ContextMenu, type MenuState } from "../ui/ContextMenu";
import { TemplateThumb } from "../editor/LeftPanel";

export function Home() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { designs, workspaces, workspaceId, refresh, selectWorkspace } = useApp();
  const [creating, setCreating] = useState(false);
  const [brandFor, setBrandFor] = useState<Workspace | null>(null);
  const [renaming, setRenaming] = useState<{ kind: "workspace" | "design"; id: string; name: string } | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [version, setVersion] = useState("");
  const checkingUpdate = useUpdate((s) => s.checking);

  useEffect(() => void refresh().catch(notifyError), []);
  useEffect(() => void getVersion().then(setVersion).catch(() => {}), []);

  const ws = workspaces.find((w) => w.id === workspaceId);
  const none = workspaceId === NO_WORKSPACE;
  const mine = designs.filter((d) => groupOf(d, workspaces) === workspaceId);
  const unlinked = designs.filter((d) => groupOf(d, workspaces) === NO_WORKSPACE);
  const usage = (id: string) => {
    const list = designs.filter((d) => groupOf(d, workspaces) === id);
    return t("home.workspaceUsage", { n: list.length, size: formatMB(list.reduce((a, d) => a + d.size, 0)) });
  };

  const manualUpdateCheck = async () => {
    try {
      const update = await checkForUpdate();
      if (!update) useUi.getState().notify(t("update.upToDate", { version }));
    } catch (e) {
      useUi.getState().notify(`${t("update.failed")}\n${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  const removeWorkspace = async (w: Workspace) => {
    if (!(await confirm({ title: t("ws.remove"), message: t("ws.removeConfirm", { name: w.name }), confirmLabel: t("ws.unlink") }))) return;
    await ipc.workspaceRemove(w.id).catch(notifyError);
    await refresh();
  };

  const removeDesign = async (d: DesignMeta) => {
    if (!(await confirm({ title: t("home.deleteDesign"), message: t("home.deleteConfirm", { name: d.name }), confirmLabel: t("common.delete"), danger: true }))) return;
    await ipc.designDelete(d.id).catch(notifyError);
    await refresh();
  };

  const rename = async (name: string) => {
    if (!renaming || !name.trim() || name.trim() === renaming.name) return setRenaming(null);
    try {
      if (renaming.kind === "workspace") await ipc.workspaceRename(renaming.id, name.trim());
      else {
        const stored = JSON.parse(await ipc.designFetch(renaming.id));
        stored.name = name.trim();
        await ipc.designStore(renaming.id, JSON.stringify(stored));
      }
      await refresh();
      setRenaming(null);
    } catch (e) {
      notifyError(e);
    }
  };

  const workspaceMenu = (e: React.MouseEvent, w: Workspace) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      title: w.path,
      items: [
        { icon: FolderOpen, label: t("home.menuOpen"), run: () => selectWorkspace(w.id) },
        { icon: Plus, label: t("home.newDesign"), run: () => (selectWorkspace(w.id), setCreating(true)) },
        { icon: Pencil, label: t("home.menuRename"), run: () => setRenaming({ kind: "workspace", id: w.id, name: w.name }) },
        { icon: ExternalLink, label: t("home.reveal"), run: () => void revealItemInDir(w.path).catch(notifyError) },
        "sep",
        { icon: Unlink, label: t("ws.remove"), danger: true, run: () => removeWorkspace(w) },
      ],
    });
  };

  const designMenu = (e: React.MouseEvent, d: DesignMeta) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      title: d.name,
      items: [
        { icon: FolderOpen, label: t("home.menuOpen"), run: () => openDesign(d.id) },
        { icon: Pencil, label: t("home.menuRename"), run: () => setRenaming({ kind: "design", id: d.id, name: d.name }) },
        "sep",
        { icon: Trash2, label: t("home.deleteDesign"), danger: true, run: () => removeDesign(d) },
      ],
    });
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4" data-tauri-drag-region>
          <img src={logo} alt="" className="h-8 w-8" draggable={false} />
          <span className="text-[13px] font-semibold">KlikDesign</span>
        </div>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="label mb-0">{t("home.workspaces")}</span>
          <button className="text-muted hover:text-accent" title={t("ws.add")} onClick={() => addWorkspace().catch(notifyError)}>
            <FolderPlus size={15} />
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => selectWorkspace(w.id)}
              onContextMenu={(e) => workspaceMenu(e, w)}
              className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left ${w.id === workspaceId ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
            >
              <Folder size={14} className={`mt-0.5 shrink-0 ${w.id === workspaceId ? "text-accent" : "text-muted"}`} />
              <span className="min-w-0">
                <span className="block truncate text-[12px]">{w.name}</span>
                <span className="block truncate text-[10px] text-muted" title={w.path}>{w.path}</span>
                <span className="block text-[10px] text-muted">{usage(w.id)}</span>
              </span>
            </button>
          ))}
          {unlinked.length > 0 && (
            <button
              onClick={() => selectWorkspace(NO_WORKSPACE)}
              className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left ${none ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
            >
              <Inbox size={14} className={`mt-0.5 shrink-0 ${none ? "text-accent" : "text-muted"}`} />
              <span className="min-w-0">
                <span className="block truncate text-[12px]">{t("home.noFolder")}</span>
                <span className="block text-[10px] text-muted">{usage(NO_WORKSPACE)}</span>
              </span>
            </button>
          )}
          <button
            onClick={() => addWorkspace().catch(notifyError)}
            className="mt-2 flex w-full items-center gap-2 rounded-md border border-dashed border-line px-2 py-2 text-[12px] text-muted hover:border-accent hover:text-text"
          >
            <FolderPlus size={14} /> {t("ws.add")}
          </button>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-2 py-1.5">
          <Button variant="ghost" className="flex-1 justify-start py-1" onClick={() => useUi.getState().open("settings")}>
            <KeyRound size={14} /> {t("home.aiSettings")}
          </Button>
          <LanguageToggle />
        </div>
        <button
          className="flex items-center justify-between border-t border-line px-3 py-1 text-[10px] text-muted hover:text-text disabled:opacity-60"
          onClick={manualUpdateCheck}
          disabled={checkingUpdate}
          title={t("update.check")}
        >
          <span>KlikDesign {version && `v${version}`}</span>
          <span className="flex items-center gap-1">
            <RefreshCw size={10} className={checkingUpdate ? "animate-spin" : ""} /> {t("update.check")}
          </span>
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {!ws && !(none && unlinked.length) ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center" data-tauri-drag-region>
            <FolderPlus size={40} className="text-accent" />
            <div>
              <h1 className="text-[18px] font-semibold">{t("home.emptyTitle")}</h1>
              <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted">{t("home.emptyBody")}</p>
            </div>
            <Button variant="primary" onClick={() => addWorkspace().catch(notifyError)}><FolderPlus size={14} /> {t("ws.add")}</Button>
          </div>
        ) : (
        <>
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-6" data-tauri-drag-region>
          <div className="group/title min-w-0">
            <div className="flex items-center gap-1.5">
              <h1
                className={`truncate text-[15px] font-semibold ${ws ? "cursor-text" : ""}`}
                onDoubleClick={() => ws && setRenaming({ kind: "workspace", id: ws.id, name: ws.name })}
              >
                {ws?.name ?? t("home.noFolder")}
              </h1>
              {ws && (
                <button className="text-muted opacity-0 group-hover/title:opacity-100 hover:text-accent" title={t("home.renameWorkspace")} onClick={() => setRenaming({ kind: "workspace", id: ws.id, name: ws.name })}>
                  <Pencil size={12} />
                </button>
              )}
            </div>
            <p className="truncate text-[11px] text-muted">{ws ? `${ws.path} · ${usage(ws.id)}` : t("home.noFolderSub")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {ws && <Button variant="ghost" onClick={() => setBrandFor(ws)}><Palette size={13} /> {t("brand.button")}</Button>}
            {ws && <Button variant="ghost" onClick={() => removeWorkspace(ws)} title={t("ws.remove")}><Unlink size={13} /></Button>}
            {ws && <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} /> {t("home.newDesign")}</Button>}
          </div>
        </header>
        <div className="flex-1 space-y-8 overflow-y-auto p-6">
          {ws && <AiCard workspace={ws} />}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold">{t("home.designs")}</h2>
            {mine.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center text-[12px] text-muted">
                <Palette size={32} />
                {t("home.noDesignsWs")}
                {ws && <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} /> {t("home.newDesign")}</Button>}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                {mine.map((d) => (
                  <div
                    key={d.id}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-line bg-panel hover:border-accent"
                    onClick={() => openDesign(d.id)}
                    onContextMenu={(e) => designMenu(e, d)}
                  >
                    <div className="checker-soft flex aspect-square items-center justify-center p-4">
                      {d.thumb ? (
                        <img src={d.thumb} alt="" className="max-h-full max-w-full shadow-lg" draggable={false} />
                      ) : (
                        <div className="bg-white/90 shadow-lg" style={{ aspectRatio: `${d.width}/${d.height}`, height: "80%" }} />
                      )}
                    </div>
                    <div className="p-3">
                      <div className="truncate text-[13px] font-medium" onDoubleClick={(e) => (e.stopPropagation(), setRenaming({ kind: "design", id: d.id, name: d.name }))}>
                        {d.name || t("home.untitled")}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {d.width}×{d.height} · {formatMB(d.size)} ·{" "}
                        {new Date(d.updatedAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <button
                      className="absolute top-2 right-10 hidden rounded-md bg-black/60 p-1.5 text-muted group-hover:block hover:text-accent"
                      title={t("home.renameDesign")}
                      onClick={(e) => (e.stopPropagation(), setRenaming({ kind: "design", id: d.id, name: d.name }))}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="absolute top-2 right-2 hidden rounded-md bg-black/60 p-1.5 text-muted group-hover:block hover:text-danger"
                      title={t("home.deleteDesign")}
                      onClick={(e) => (e.stopPropagation(), removeDesign(d))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        </>
        )}
      </main>
      {creating && ws && <NewDesignDialog workspace={ws} onClose={() => setCreating(false)} />}
      {renaming && (
        <RenameDialog
          title={t(renaming.kind === "workspace" ? "home.renameWorkspace" : "home.renameDesign")}
          initial={renaming.name}
          onSave={rename}
          onClose={() => setRenaming(null)}
        />
      )}
      {brandFor && (
        <Modal title={t("brand.title", { name: brandFor.name })} onClose={() => setBrandFor(null)} width={480}>
          <BrandKitEditor workspaceId={brandFor.id} />
        </Modal>
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}

/** Prompt → poster in the selected workspace. */
function AiCard({ workspace }: { workspace: Workspace }) {
  const t = useT();
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [size, setSize] = useState(SIZE_PRESETS[0].id);
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const p = SIZE_PRESETS.find((x) => x.id === size)!;
      // Without a title the AI names the design once it knows what it is.
      await createDesign({ width: p.width, height: p.height, name: title.trim() || t("home.untitled"), workspaceId: workspace.id });
      useUi.getState().setRightTab("ai");
      void sendChat(prompt);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-line bg-gradient-to-br from-accent-2/25 via-panel to-accent/10 p-5">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold"><Sparkles size={18} className="text-accent" /> {t("home.aiTitle")}</h2>
      <p className="mt-1 text-[12px] text-muted">{t("home.aiSubWs", { name: workspace.name })}</p>
      <input
        className="field mt-3 text-[13px]"
        placeholder={t("home.aiTitlePlaceholder")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="field mt-2 min-h-20 resize-none text-[13px]"
        placeholder={t("home.aiPlaceholderWs")}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && void generate()}
      />
      <SizeTiles className="mt-3 grid-cols-4 sm:grid-cols-7" value={size} onChange={setSize} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="w-64"><ModelPicker /></div>
        <div className="flex-1" />
        <Button variant="primary" disabled={!prompt.trim() || busy} onClick={generate}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {t("home.generate")}
        </Button>
      </div>
    </section>
  );
}

function NewDesignDialog({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [size, setSize] = useState(SIZE_PRESETS[0].id);
  const [template, setTemplate] = useState<string | null>(null);
  const create = async () => {
    try {
      const tpl = TEMPLATES.find((x) => x.id === template);
      const p = SIZE_PRESETS.find((x) => x.id === size)!;
      const base = tpl ? structuredClone(tpl.design) : { width: p.width, height: p.height };
      await createDesign({ ...(base as object), name: name.trim() || (tpl ? t(tpl.name) : t("home.untitled")), workspaceId: workspace.id });
      onClose();
    } catch (e) {
      notifyError(e);
    }
  };
  return (
    <Modal title={t("home.newDesignTitle")} onClose={onClose} width={620}>
      <div className="space-y-4">
        <p className="flex items-center gap-1.5 rounded-md bg-accent/10 px-2.5 py-2 text-[11px] text-accent">
          <Folder size={12} /> {t("home.newInWs", { name: workspace.name })}
        </p>
        <label className="block">
          <span className="label">{t("home.designName")}</span>
          <input autoFocus className="field" placeholder={t("home.untitled")} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </label>
        <div>
          <span className="label">{t("insp.size")}</span>
          <SizeTiles className="grid-cols-4" value={template ? null : size} onChange={(id) => (setSize(id), setTemplate(null))} />
        </div>
        <div>
          <span className="label">{t("home.orTemplate")}</span>
          <div className="grid grid-cols-4 gap-2">
            {TEMPLATES.map((tpl) => (
              <button key={tpl.id} onClick={() => setTemplate(template === tpl.id ? null : tpl.id)} className={`group rounded-lg border p-2 ${template === tpl.id ? "border-accent bg-accent/10" : "border-line hover:border-muted"}`}>
                <div className="flex h-28 items-center justify-center">
                  <div className="h-full max-w-full" style={{ aspectRatio: `${tpl.design.width}/${tpl.design.height}` }}><TemplateThumb tpl={tpl} /></div>
                </div>
                <div className="mt-1 truncate text-[11px]">{t(tpl.name)}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={create}>{t("home.createDesign")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function RenameDialog({ title, initial, onSave, onClose }: { title: string; initial: string; onSave: (name: string) => void; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState(initial);
  return (
    <Modal title={title} onClose={onClose} width={420}>
      <div className="space-y-4">
        <input autoFocus className="field" value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => e.key === "Enter" && onSave(name)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onSave(name)}>{t("common.save")}</Button>
        </div>
      </div>
    </Modal>
  );
}
