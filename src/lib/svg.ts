// Serializes a design to standalone SVG. Pure: the caller passes the wrapped
// text lines (as the canvas laid them out) and image data URIs.
import type { Design, El, Fill, Shadow } from "../types/design";
import { isGradient } from "../types/design";
import { cssUrl, googleFont } from "./fonts";
import { gradientPoints, imageCrop, maskPath, polygonPoints, textHeight } from "./geometry";
import { qrPath } from "./qr";

export interface SvgInputs {
  /** Wrapped lines per text element id. */
  lines: Record<string, string[]>;
  /** Data URI per image `src`, or per element id for an adjusted photo. */
  images: Record<string, string>;
  /** Natural size per image `src` (or element id, for adjusted photos), needed to export a crop. */
  sizes?: Record<string, { w: number; h: number }>;
  /** Path data per icon name (the icon library loads on demand). */
  icons?: Record<string, string[]>;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => String(Math.round(v * 100) / 100);

export function designToSvg(d: Design, inputs: SvgInputs): string {
  const defs: string[] = [];
  let seq = 0;
  const uid = (p: string) => `${p}${++seq}`;

  const paint = (f: Fill | undefined, w: number, h: number): string => {
    if (!f) return "none";
    if (!isGradient(f)) return esc(f);
    const id = uid("g");
    const { start, end } = gradientPoints(f, w, h);
    const stops = f.colors.map((c, i) => `<stop offset="${n(f.colors.length === 1 ? 0 : i / (f.colors.length - 1))}" stop-color="${esc(c)}"/>`).join("");
    defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(start.x)}" y1="${n(start.y)}" x2="${n(end.x)}" y2="${n(end.y)}">${stops}</linearGradient>`);
    return `url(#${id})`;
  };

  const shadow = (s: Shadow | null | undefined): string => {
    if (!s) return "";
    const id = uid("s");
    defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${n(s.offsetX)}" dy="${n(s.offsetY)}" stdDeviation="${n(s.blur / 2)}" flood-color="${esc(s.color)}"/></filter>`);
    return ` filter="url(#${id})"`;
  };

  const strokeAttrs = (stroke?: string, width?: number) => (stroke && width ? ` stroke="${esc(stroke)}" stroke-width="${n(width)}"` : "");

  const body = (e: El): string => {
    switch (e.type) {
      case "shape": {
        const fill = paint(e.fill, e.w, e.h);
        const st = strokeAttrs(e.stroke, e.strokeWidth);
        if (e.shape === "rect") return `<rect width="${n(e.w)}" height="${n(e.h)}" rx="${n(Math.min(e.cornerRadius ?? 0, e.w / 2, e.h / 2))}" fill="${fill}"${st}/>`;
        if (e.shape === "ellipse") return `<ellipse cx="${n(e.w / 2)}" cy="${n(e.h / 2)}" rx="${n(e.w / 2)}" ry="${n(e.h / 2)}" fill="${fill}"${st}/>`;
        if (e.shape === "line") return `<line x1="0" y1="${n(e.h / 2)}" x2="${n(e.w)}" y2="${n(e.h / 2)}" stroke-linecap="round"${strokeAttrs(e.stroke ?? "#111111", e.strokeWidth ?? 4)}/>`;
        const pts = polygonPoints(e.shape, e.w, e.h);
        const pairs: string[] = [];
        for (let i = 0; i < pts.length; i += 2) pairs.push(`${n(pts[i])},${n(pts[i + 1])}`);
        return `<polygon points="${pairs.join(" ")}" fill="${fill}"${st} stroke-linejoin="round"/>`;
      }
      case "image": {
        // An adjusted photo is passed by element id, already processed.
        const href = inputs.images[e.id] ?? inputs.images[e.src];
        if (!href) return "";
        let clip = "";
        if (e.mask || e.cornerRadius) {
          const id = uid("c");
          const shape = e.mask ? `<path d="${maskPath(e.mask, e.w, e.h)}"/>` : `<rect width="${n(e.w)}" height="${n(e.h)}" rx="${n(e.cornerRadius!)}"/>`;
          defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
          clip = ` clip-path="url(#${id})"`;
        }
        const size = inputs.sizes?.[e.id] ?? inputs.sizes?.[e.src];
        const overlay = e.overlay ? `<rect width="${n(e.w)}" height="${n(e.h)}" fill="${esc(e.overlay.color)}" opacity="${n(e.overlay.opacity)}"/>` : "";
        let photo: string;
        if (e.crop && size) {
          // The crop as a viewBox onto the whole image, which the nested svg clips to the box.
          const c = imageCrop(size.w, size.h, e.w, e.h, e.crop);
          photo = `<svg width="${n(e.w)}" height="${n(e.h)}" viewBox="${n(c.x)} ${n(c.y)} ${n(c.width)} ${n(c.height)}" preserveAspectRatio="none"><image href="${href}" width="${size.w}" height="${size.h}"/></svg>`;
        } else photo = `<image href="${href}" width="${n(e.w)}" height="${n(e.h)}" preserveAspectRatio="xMidYMid slice"/>`;
        return clip || overlay ? `<g${clip}>${photo}${overlay}</g>` : photo;
      }
      case "icon": {
        const paths = inputs.icons?.[e.icon];
        if (!paths) return "";
        const body = paths.map((d) => `<path d="${esc(d)}"/>`).join("");
        return `<g transform="scale(${n(e.w / 24)} ${n(e.h / 24)})" fill="none" stroke="${esc(e.color)}" stroke-width="${n(e.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
      }
      case "qr": {
        const qr = qrPath(e.data);
        if (!qr) return "";
        const bg = e.background === "transparent" ? "" : `<rect width="${n(e.w)}" height="${n(e.h)}" fill="${esc(e.background)}"/>`;
        return `${bg}<path transform="scale(${n(e.w / qr.size)})" d="${qr.path}" fill="${esc(e.color)}"/>`;
      }
      case "text": {
        const lines = inputs.lines[e.id] ?? e.text.split("\n");
        const lh = e.fontSize * e.lineHeight;
        const x = e.align === "center" ? e.w / 2 : e.align === "right" ? e.w : 0;
        const anchor = e.align === "center" ? "middle" : e.align === "right" ? "end" : "start";
        const fill = paint(e.fill, e.w, textHeight(lines.length, e.fontSize, e.lineHeight));
        const spans = lines.map((l, i) => `<tspan x="${n(x)}" y="${n(lh * i + lh / 2)}">${esc(l)}</tspan>`).join("");
        const style = `font-family:'${esc(e.fontFamily)}',sans-serif;font-size:${n(e.fontSize)}px;font-weight:${e.fontWeight}${e.italic ? ";font-style:italic" : ""}${e.letterSpacing ? `;letter-spacing:${n(e.letterSpacing)}px` : ""}`;
        const st = e.stroke && e.strokeWidth ? `${strokeAttrs(e.stroke, e.strokeWidth)} paint-order="stroke"` : "";
        return `<text text-anchor="${anchor}" dominant-baseline="central" fill="${fill}"${st} style="${style}" xml:space="preserve">${spans}</text>`;
      }
    }
  };

  const items = d.elements
    .filter((e) => !e.hidden)
    .map((e) => {
      const inner = body(e);
      if (!inner) return "";
      const tf = `translate(${n(e.x)} ${n(e.y)})${e.rotation ? ` rotate(${n(e.rotation)})` : ""}`;
      const op = e.opacity < 1 ? ` opacity="${n(e.opacity)}"` : "";
      return `<g transform="${tf}"${op}${shadow(e.shadow)}>${inner}</g>`;
    })
    .join("\n");

  const bg = paint(d.background, d.width, d.height);
  const fonts = [...new Set(d.elements.flatMap((e) => (e.type === "text" ? [e.fontFamily] : [])))]
    .map(googleFont)
    .filter((f) => !!f)
    .map((f) => `@import url('${esc(cssUrl(f))}');`)
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">`,
    fonts ? `<style>${fonts}</style>` : "",
    `<defs>${defs.join("")}</defs>`,
    `<rect width="${d.width}" height="${d.height}" fill="${bg}"/>`,
    items,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}
