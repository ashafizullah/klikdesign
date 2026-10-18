// PNG/JPG/PDF/SVG export of the open design.
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useDesign } from "../store/design";
import { renderPage, textLines } from "./stage";
import { designToSvg } from "./svg";
import { imageDataUri } from "./images";
import { ensureFonts } from "./fonts";

export type ExportFormat = "png" | "jpg" | "pdf" | "svg";

const dataUrlBytes = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));

export async function buildExport(format: ExportFormat, scale: number): Promise<Uint8Array> {
  const d = useDesign.getState().design;
  await ensureFonts(d.elements.flatMap((e) => (e.type === "text" ? [e.fontFamily] : [])));
  switch (format) {
    case "png":
      return dataUrlBytes(renderPage(scale));
    case "jpg":
      return dataUrlBytes(renderPage(scale, "image/jpeg", 0.92));
    case "pdf": {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "px", format: [d.width, d.height], orientation: d.width > d.height ? "landscape" : "portrait", hotfixes: ["px_scaling"], compress: true });
      pdf.addImage(renderPage(scale), "PNG", 0, 0, d.width, d.height, undefined, "FAST");
      return new Uint8Array(pdf.output("arraybuffer"));
    }
    case "svg": {
      const images: Record<string, string> = {};
      for (const e of d.elements) if (e.type === "image" && !images[e.src]) images[e.src] = await imageDataUri(e.src);
      return new TextEncoder().encode(designToSvg(d, { lines: textLines(), images }));
    }
  }
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "design";

/** Asks where to save, then writes the file. Returns the path, or null when cancelled. */
export async function exportDesign(format: ExportFormat, scale: number): Promise<string | null> {
  const { name } = useDesign.getState().design;
  const path = await save({ defaultPath: `${safeName(name)}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (!path) return null;
  await writeFile(path, await buildExport(format, scale));
  return path;
}
