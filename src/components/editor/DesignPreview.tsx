// HTML/CSS rendering of a design for previews (templates). CSS wraps text the
// same way the canvas does closely enough for a thumbnail, without a Konva stage.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Design, El, Fill } from "../../types/design";
import { isGradient } from "../../types/design";
import { polygonPoints } from "../../lib/geometry";
import { ensureFont, ensureFonts } from "../../lib/fonts";
import { useImage } from "../../lib/images";

export const cssFill = (f: Fill) => (isGradient(f) ? `linear-gradient(${f.angle + 90}deg, ${f.colors.join(", ")})` : f);

function clip(shape: "triangle" | "star", w: number, h: number) {
  const pts = polygonPoints(shape, w, h);
  const pairs: string[] = [];
  for (let i = 0; i < pts.length; i += 2) pairs.push(`${(pts[i] / w) * 100}% ${(pts[i + 1] / h) * 100}%`);
  return `polygon(${pairs.join(", ")})`;
}

function Item({ e }: { e: El }) {
  const base: CSSProperties = {
    position: "absolute",
    left: e.x,
    top: e.y,
    width: e.w,
    transform: e.rotation ? `rotate(${e.rotation}deg)` : undefined,
    transformOrigin: "top left",
    opacity: e.opacity,
    display: e.hidden ? "none" : undefined,
  };
  if (e.type === "text") {
    const grad = isGradient(e.fill);
    return (
      <div
        style={{
          ...base,
          fontFamily: `"${e.fontFamily}"`,
          fontSize: e.fontSize,
          fontWeight: e.fontWeight,
          fontStyle: e.italic ? "italic" : undefined,
          lineHeight: e.lineHeight,
          letterSpacing: e.letterSpacing,
          textAlign: e.align,
          textTransform: e.uppercase ? "uppercase" : undefined,
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          color: grad ? "transparent" : (e.fill as string),
          background: grad ? cssFill(e.fill) : undefined,
          backgroundClip: grad ? "text" : undefined,
          WebkitTextStroke: e.stroke && e.strokeWidth ? `${e.strokeWidth}px ${e.stroke}` : undefined,
        }}
      >
        {e.text}
      </div>
    );
  }
  if (e.type === "image") return <div style={{ ...base, height: e.h, background: "#d4d4d8", borderRadius: e.cornerRadius }} />;
  if (e.shape === "line") return <div style={{ ...base, top: e.y + e.h / 2 - (e.strokeWidth ?? 4) / 2, height: e.strokeWidth ?? 4, background: e.stroke, borderRadius: 99 }} />;
  return (
    <div
      style={{
        ...base,
        height: e.h,
        background: cssFill(e.fill),
        borderRadius: e.shape === "ellipse" ? "50%" : e.shape === "rect" ? e.cornerRadius : undefined,
        clipPath: e.shape === "triangle" || e.shape === "star" ? clip(e.shape, e.w, e.h) : undefined,
        border: e.stroke && e.strokeWidth && e.shape !== "star" && e.shape !== "triangle" ? `${e.strokeWidth}px solid ${e.stroke}` : undefined,
        boxSizing: "border-box",
      }}
    />
  );
}

export function DesignPreview({ design, className = "" }: { design: Design; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setK(el.clientWidth / design.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [design.width]);
  useEffect(() => void ensureFonts(design.elements.flatMap((e) => (e.type === "text" ? [e.fontFamily] : []))), [design]);
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`} style={{ aspectRatio: `${design.width}/${design.height}`, background: cssFill(design.background) }}>
      {k > 0 && (
        <div style={{ position: "absolute", left: 0, top: 0, width: design.width, height: design.height, transform: `scale(${k})`, transformOrigin: "top left" }}>
          {design.elements.map((e) => <Item key={e.id} e={e} />)}
        </div>
      )}
    </div>
  );
}

/** Relative luminance (0–1) of a #rgb/#rrggbb color; mid-grey for anything else. */
function luminance(c: string): number {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return 0.5;
  const hex = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Small preview of one element (layers list): the image, the shape in its colors, or "Aa" in the text's font. */
export function ElementThumb({ e, size = 32 }: { e: El; size?: number }) {
  const img = useImage(e.type === "image" ? e.src : "");
  useEffect(() => void (e.type === "text" && ensureFont(e.fontFamily)), [e]);
  const color = e.type === "image" ? "#888" : e.type === "shape" && e.shape === "line" ? (e.stroke ?? "#888") : isGradient(e.fill) ? e.fill.colors[0] : e.fill;
  // Light marks get a dark tile and dark marks a light one, so every layer stays visible.
  const bg = luminance(color) > 0.55 ? "#1f2023" : "#e7e7ea";
  const box: CSSProperties = { width: size, height: size, background: bg };
  if (e.type === "image") {
    return (
      <div className="flex shrink-0 items-center justify-center overflow-hidden rounded border border-line" style={box}>
        {img && <img src={img.src} alt="" className="max-h-full max-w-full object-contain" draggable={false} />}
      </div>
    );
  }
  if (e.type === "text") {
    const grad = isGradient(e.fill);
    return (
      <div className="flex shrink-0 items-center justify-center overflow-hidden rounded border border-line" style={box}>
        <span
          style={{
            fontFamily: `"${e.fontFamily}"`,
            fontWeight: e.fontWeight,
            fontStyle: e.italic ? "italic" : undefined,
            fontSize: size * 0.5,
            lineHeight: 1,
            color: grad ? "transparent" : (e.fill as string),
            background: grad ? cssFill(e.fill) : undefined,
            backgroundClip: grad ? "text" : undefined,
            WebkitTextStroke: e.stroke && e.strokeWidth ? `1px ${e.stroke}` : undefined,
          }}
        >
          Aa
        </span>
      </div>
    );
  }
  const inner = size - 8;
  const k = inner / Math.max(e.w, e.h, 1);
  const shape = { ...e, x: 0, y: 0, rotation: 0, opacity: 1, hidden: false, strokeWidth: e.strokeWidth && Math.max(e.strokeWidth, 2 / k) };
  return (
    <div className="relative shrink-0 overflow-hidden rounded border border-line" style={box}>
      <div style={{ position: "absolute", left: (size - e.w * k) / 2, top: (size - e.h * k) / 2, width: e.w, height: e.h, transform: `scale(${k})`, transformOrigin: "top left" }}>
        <Item e={shape} />
      </div>
    </div>
  );
}
