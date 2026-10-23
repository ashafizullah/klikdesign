// Brand kit editor. In the editor, clicking a color, font or logo also applies it.
import { useEffect, useState } from "react";
import { ImagePlus, Plus, X } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { TextEl } from "../../types/design";
import { saveBrand, useBrandKit, type BrandKit } from "../../store/brand";
import { useDesign } from "../../store/design";
import { notifyError } from "../../store/ui";
import { ensureFont } from "../../lib/fonts";
import { ipc } from "../../lib/ipc";
import { IMAGE_EXTS, mediaChanged, placeImage } from "../../lib/media";
import { TEXT_PRESETS, placeOnPage } from "../../lib/templates";
import { normalizeElement } from "../../types/design";
import { useT } from "../../i18n";
import { Button } from "../ui";
import { FontPicker } from "../ui/FontPicker";
import { useImage } from "../../lib/images";
import { fontPatch } from "./Inspector";

/** Applies a brand color: fill of the selected text and shapes (stroke of lines), or the page background. */
function applyColor(c: string) {
  const { design, selected, patchMany, update } = useDesign.getState();
  const sel = design.elements.filter((e) => selected.includes(e.id) && e.type !== "image");
  if (!sel.length) return update((d) => void (d.background = c));
  patchMany(sel.map((e) => ({ id: e.id, patch: e.type === "shape" && e.shape === "line" ? { stroke: c } : { fill: c } })));
}

/** Applies a brand font to the selected text, or adds a heading in it. */
function applyFont(family: string) {
  const { design, selected, patchMany, add } = useDesign.getState();
  const texts = design.elements.filter((e): e is TextEl => selected.includes(e.id) && e.type === "text");
  if (texts.length) return patchMany(texts.map((e) => ({ id: e.id, patch: fontPatch(e, family) })));
  const el = normalizeElement(placeOnPage({ ...TEXT_PRESETS[0].el, fontFamily: family }, design), "");
  if (el?.type !== "text") return;
  void ensureFont(family);
  const { id: _id, ...rest } = el;
  add([{ ...rest, ...fontPatch(el, family) }]);
}

async function placeLogo(path: string) {
  const src = await ipc.mediaImport(useDesign.getState().design.id, path);
  mediaChanged();
  await placeImage(src);
}

export function BrandKitEditor({ workspaceId, apply }: { workspaceId: string; apply?: boolean }) {
  const t = useT();
  const kit = useBrandKit(workspaceId);
  const [color, setColor] = useState("#7c5cff");
  const [voice, setVoice] = useState(kit.voice);
  useEffect(() => setVoice(kit.voice), [kit.voice]);
  const save = (next: Partial<BrandKit>) => saveBrand(workspaceId, { ...kit, ...next }).catch(notifyError);

  const addLogos = async () => {
    const picked = await openDialog({ multiple: true, filters: [{ name: t("left.images"), extensions: IMAGE_EXTS }] });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    const logos = [...kit.logos];
    for (const path of paths) logos.push(await ipc.brandLogoImport(workspaceId, { path }));
    if (paths.length) await save({ logos });
  };

  return (
    <div className="space-y-4">
      {apply && <p className="text-[11px] leading-relaxed text-muted">{t("brand.applyHint")}</p>}

      <section>
        <div className="label">{t("brand.colors")}</div>
        <div className="flex flex-wrap gap-1.5">
          {kit.colors.map((c) => (
            <div key={c} className="group relative">
              <button
                title={apply ? t("brand.applyColor", { color: c }) : c}
                onClick={() => apply && applyColor(c)}
                className={`h-8 w-8 rounded-md border border-line ${apply ? "hover:scale-105" : "cursor-default"}`}
                style={{ background: c }}
              />
              <RemoveButton onClick={() => save({ colors: kit.colors.filter((x) => x !== c) })} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <input type="color" className="h-7 w-9 shrink-0 cursor-pointer rounded border border-line bg-transparent" value={color} onChange={(e) => setColor(e.target.value)} />
          <input className="field font-mono" value={color} onChange={(e) => setColor(e.target.value)} spellCheck={false} />
          <Button title={t("brand.addColor")} disabled={!color.trim()} onClick={() => save({ colors: [...kit.colors, color.trim()] })}><Plus size={13} /></Button>
        </div>
      </section>

      <section>
        <div className="label">{t("brand.fonts")}</div>
        <div className="space-y-1">
          {kit.fonts.map((f) => (
            <div key={f} className="group relative">
              <button
                onClick={() => apply && applyFont(f)}
                title={apply ? t("brand.applyFont") : f}
                className={`block w-full truncate rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-left text-[14px] ${apply ? "hover:border-accent" : "cursor-default"}`}
                style={{ fontFamily: `"${f}"` }}
              >
                {f}
              </button>
              <RemoveButton onClick={() => save({ fonts: kit.fonts.filter((x) => x !== f) })} />
            </div>
          ))}
        </div>
        <FontPicker className="mt-2" value={t("brand.addFont")} onChange={(f) => save({ fonts: [...kit.fonts, f] })} />
      </section>

      <section>
        <div className="label">{t("brand.logos")}</div>
        {kit.logos.length > 0 && (
          <div className="mb-2 grid grid-cols-3 gap-1.5">
            {kit.logos.map((path) => (
              <div key={path} className="group relative">
                <button
                  onClick={() => apply && placeLogo(path).catch(notifyError)}
                  title={apply ? t("brand.placeLogo") : undefined}
                  className={`block w-full overflow-hidden rounded border border-line bg-white/5 ${apply ? "hover:border-accent" : "cursor-default"}`}
                >
                  <LogoThumb path={path} />
                </button>
                <RemoveButton onClick={() => save({ logos: kit.logos.filter((x) => x !== path) })} />
              </div>
            ))}
          </div>
        )}
        <Button className="w-full" onClick={() => addLogos().catch(notifyError)}><ImagePlus size={13} /> {t("brand.addLogo")}</Button>
      </section>

      <section>
        <div className="label">{t("brand.voice")}</div>
        <textarea
          className="field min-h-20 resize-y"
          placeholder={t("brand.voicePlaceholder")}
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          onBlur={() => voice !== kit.voice && save({ voice })}
        />
      </section>
      <p className="text-[11px] leading-relaxed text-muted">{t("brand.aiNote")}</p>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick(): void }) {
  const t = useT();
  return (
    <button
      title={t("brand.remove")}
      onClick={onClick}
      className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-line bg-panel text-muted group-hover:flex hover:text-danger"
    >
      <X size={10} />
    </button>
  );
}

function LogoThumb({ path }: { path: string }) {
  const img = useImage(path);
  return img ? <img src={img.src} alt="" className="aspect-square w-full object-contain p-1" draggable={false} /> : <div className="aspect-square w-full" />;
}
