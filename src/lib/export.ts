// PNG/JPG/PDF/SVG export of the open design.
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useDesign } from "../store/design";
import { renderPage, textLines } from "./stage";
import { designToSvg } from "./svg";
import { imageDataUri, loadImage } from "./images";
import { pageCount } from "./pages";
import { ensureFonts } from "./fonts";

export type ExportFormat = "png" | "jpg" | "pdf" | "svg";

const dataUrlBytes = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));

/** Renders the open page. */
async function buildPage(format: ExportFormat, scale: number): Promise<Uint8Array> {
  const d = useDesign.getState().design;
  await ensureFonts(d.elements.flatMap((e) => (e.type === "text" ? [e.fontFamily] : [])));
  switch (format) {
    case "png":
      return dataUrlBytes(renderPage(scale));
    case "jpg":
      return dataUrlBytes(renderPage(scale, "image/jpeg", 0.92));
    case "pdf":
      return pdfOf([renderPage(scale)]);
    case "svg": {
      const images: Record<string, string> = {};
      for (const e of d.elements) if (e.type === "image" && !images[e.src]) images[e.src] = await imageDataUri(e.src);
      return new TextEncoder().encode(designToSvg(d, { lines: textLines(), images }));
    }
  }
}

async function pdfOf(pngs: string[]): Promise<Uint8Array> {
  const d = useDesign.getState().design;
  const { jsPDF } = await import("jspdf");
  const orientation = d.width > d.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ unit: "px", format: [d.width, d.height], orientation, hotfixes: ["px_scaling"], compress: true });
  pngs.forEach((png, i) => {
    if (i) pdf.addPage([d.width, d.height], orientation);
    pdf.addImage(png, "PNG", 0, 0, d.width, d.height, undefined, "FAST");
  });
  return new Uint8Array(pdf.output("arraybuffer"));
}

/** Waits until the canvas shows the open page with its fonts and images. */
async function settlePage() {
  const { elements } = useDesign.getState().design;
  await ensureFonts(elements.flatMap((e) => (e.type === "text" ? [e.fontFamily] : [])));
  await Promise.all(elements.flatMap((e) => (e.type === "image" ? [loadImage(e.src).catch(() => null)] : [])));
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
}

/** Opens each page in turn (outside the undo history), runs `fn`, then reopens the page that was open. */
async function eachPage<T>(fn: (i: number) => Promise<T>): Promise<T[]> {
  const store = useDesign.getState();
  const start = store.design.page ?? 0;
  const out: T[] = [];
  useDesign.temporal.getState().pause();
  try {
    for (let i = 0; i < pageCount(store.design); i++) {
      useDesign.getState().openPage(i);
      await settlePage();
      out.push(await fn(i));
    }
  } finally {
    useDesign.getState().openPage(start);
    useDesign.temporal.getState().resume();
  }
  return out;
}

/** The exported file(s): one per page for PNG, JPG and SVG with `all`, a single file otherwise (PDF holds every page). */
export async function buildExport(format: ExportFormat, scale: number, all = false): Promise<Uint8Array[]> {
  if (!all || pageCount(useDesign.getState().design) < 2) return [await buildPage(format, scale)];
  if (format === "pdf") return [await pdfOf(await eachPage(async () => renderPage(scale)))];
  return eachPage(() => buildPage(format, scale));
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "design";

/** `poster.png` → `poster-2.png` for page 2 of several. */
export const numberedPath = (path: string, n: number) => path.replace(/(\.[^./\\]+)?$/, (ext) => `-${n}${ext}`);

/** Writes the export to `path` (numbered per page when there are several); returns the paths written. */
export async function writeExport(path: string, files: Uint8Array[]): Promise<string[]> {
  const paths = files.length > 1 ? files.map((_, i) => numberedPath(path, i + 1)) : [path];
  for (const [i, p] of paths.entries()) await writeFile(p, files[i]);
  return paths;
}

/** Asks where to save, then writes the file(s). Returns the first path, or null when cancelled. */
export async function exportDesign(format: ExportFormat, scale: number, all = false): Promise<string | null> {
  const { name } = useDesign.getState().design;
  const path = await save({ defaultPath: `${safeName(name)}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (!path) return null;
  const [first] = await writeExport(path, await buildExport(format, scale, all));
  return first;
}
