// One design element on the Konva canvas. Each element is a Group placed at
// (x, y) with rotation; its shape is drawn inside the 0…w × 0…h box.
import { useEffect, useLayoutEffect, useRef } from "react";
import type Konva from "konva";
import { Ellipse, Group, Image as KImage, Line, Path, Rect, Text } from "react-konva";
import type { El, Fill, IconEl, ImageEl, QrEl, Shadow, TextEl } from "../../types/design";
import { isGradient } from "../../types/design";
import { colorStops, gradientPoints, imageCrop, maskPath, polygonPoints } from "../../lib/geometry";
import { useAdjusted, sizeOf } from "../../lib/imageAdjust";
import { iconPaths, loadIcons, useIcons } from "../../lib/icons";
import { qrPath } from "../../lib/qr";
import { useImage } from "../../lib/images";
import { useFonts } from "../../lib/fonts";

/** Konva fill props for a solid color or a linear gradient over a w×h box. */
export function fillProps(f: Fill, w: number, h: number, origin = { x: 0, y: 0 }): Record<string, unknown> {
  if (!isGradient(f)) return { fill: f };
  const { start, end } = gradientPoints(f, w, h);
  const at = (p: { x: number; y: number }) => ({ x: p.x - origin.x, y: p.y - origin.y });
  return { fillPriority: "linear-gradient", fillLinearGradientStartPoint: at(start), fillLinearGradientEndPoint: at(end), fillLinearGradientColorStops: colorStops(f) };
}

function shadowProps(s: Shadow | null | undefined) {
  if (!s) return {};
  return { shadowColor: s.color, shadowBlur: s.blur, shadowOffsetX: s.offsetX, shadowOffsetY: s.offsetY, shadowEnabled: true };
}

function TextShape({ el, editing }: { el: TextEl; editing: boolean }) {
  const ref = useRef<Konva.Text>(null);
  const fonts = useFonts((s) => s.version);
  // Gradients need the laid-out height, known only after the text is measured.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !isGradient(el.fill)) return;
    node.setAttrs(fillProps(el.fill, el.w, node.height()));
  });
  return (
    <Text
      ref={ref}
      key={fonts}
      elId={el.id}
      text={el.uppercase ? el.text.toUpperCase() : el.text}
      width={el.w}
      fontFamily={`"${el.fontFamily}"`}
      fontSize={el.fontSize}
      fontStyle={`${el.italic ? "italic " : ""}${el.fontWeight}`}
      align={el.align}
      lineHeight={el.lineHeight}
      letterSpacing={el.letterSpacing}
      {...(isGradient(el.fill) ? {} : { fill: el.fill })}
      stroke={el.stroke}
      strokeWidth={el.stroke ? el.strokeWidth : 0}
      fillAfterStrokeEnabled
      opacity={editing ? 0 : 1}
      {...shadowProps(el.shadow)}
    />
  );
}

function ImageShape({ el }: { el: ImageEl }) {
  const img = useAdjusted(useImage(el.src), el.adjust);
  const radius = el.mask ? undefined : el.cornerRadius;
  let body;
  if (!img) body = <Rect width={el.w} height={el.h} fill="#e5e7eb" cornerRadius={radius} />;
  else {
    const size = sizeOf(img);
    const { x, y, width, height } = imageCrop(size.w, size.h, el.w, el.h, el.crop);
    body = <KImage image={img} width={el.w} height={el.h} crop={{ x, y, width, height }} cornerRadius={radius} {...(el.mask || el.overlay ? {} : shadowProps(el.shadow))} />;
  }
  if (!el.mask && !el.overlay) return body;
  // A frame clips the photo (and its overlay) to its shape.
  const clip = el.mask ? new Path2D(maskPath(el.mask, el.w, el.h)) : null;
  return (
    <Group clipFunc={clip ? () => [clip] : undefined}>
      {body}
      {el.overlay && <Rect width={el.w} height={el.h} fill={el.overlay.color} opacity={el.overlay.opacity} cornerRadius={radius} listening={false} />}
    </Group>
  );
}

function IconShape({ el }: { el: IconEl }) {
  const lib = useIcons((s) => s.lib);
  useEffect(() => void loadIcons(), []);
  const paths = iconPaths(lib, el.icon) ?? [];
  return (
    <>
      {/* The strokes alone would only be clickable on their lines. */}
      <Rect width={el.w} height={el.h} fill="transparent" />
      <Group scaleX={el.w / 24} scaleY={el.h / 24} {...shadowProps(el.shadow)}>
        {paths.map((d, i) => (
          <Path key={i} data={d} stroke={el.color} strokeWidth={el.strokeWidth} lineCap="round" lineJoin="round" fillEnabled={false} listening={false} />
        ))}
      </Group>
    </>
  );
}

function QrShape({ el }: { el: QrEl }) {
  const qr = qrPath(el.data);
  if (!qr) return <Rect width={el.w} height={el.h} fill="#fee2e2" stroke="#dc2626" strokeWidth={2} dash={[6, 4]} />;
  const k = el.w / qr.size;
  return (
    <>
      <Rect width={el.w} height={el.h} fill={el.background === "transparent" ? "transparent" : el.background} {...shadowProps(el.shadow)} />
      <Path data={qr.path} fill={el.color} scaleX={k} scaleY={k} listening={false} />
    </>
  );
}

function Body({ el, editing }: { el: El; editing: boolean }) {
  if (el.type === "text") return <TextShape el={el} editing={editing} />;
  if (el.type === "image") return <ImageShape el={el} />;
  if (el.type === "icon") return <IconShape el={el} />;
  if (el.type === "qr") return <QrShape el={el} />;
  const fill = fillProps(el.fill, el.w, el.h);
  const stroke = { stroke: el.stroke, strokeWidth: el.stroke ? el.strokeWidth : 0, ...shadowProps(el.shadow) };
  switch (el.shape) {
    case "rect":
      return <Rect width={el.w} height={el.h} cornerRadius={Math.min(el.cornerRadius ?? 0, el.w / 2, el.h / 2)} {...fill} {...stroke} />;
    case "ellipse":
      // Ellipses draw around their center, so the gradient is shifted into that frame.
      return <Ellipse x={el.w / 2} y={el.h / 2} radiusX={el.w / 2} radiusY={el.h / 2} {...fillProps(el.fill, el.w, el.h, { x: el.w / 2, y: el.h / 2 })} {...stroke} />;
    case "line":
      return (
        <Line
          points={[0, el.h / 2, el.w, el.h / 2]}
          stroke={el.stroke ?? "#111111"}
          strokeWidth={el.strokeWidth ?? 4}
          lineCap="round"
          hitStrokeWidth={Math.max(20, el.strokeWidth ?? 4)}
          {...shadowProps(el.shadow)}
        />
      );
    default:
      return <Line points={polygonPoints(el.shape, el.w, el.h)} closed lineJoin="round" {...fill} {...stroke} />;
  }
}

export interface NodeHandlers {
  onPointerDown(el: El, e: Konva.KonvaEventObject<MouseEvent>): void;
  onDblClick(el: El): void;
  onDragStart(el: El, e: Konva.KonvaEventObject<DragEvent>): void;
  onDragMove(el: El, e: Konva.KonvaEventObject<DragEvent>): void;
  onDragEnd(el: El, e: Konva.KonvaEventObject<DragEvent>): void;
  onTransformEnd(el: El, node: Konva.Group): void;
}

export function ElementNode({ el, editing, h }: { el: El; editing: boolean; h: NodeHandlers }) {
  const ref = useRef<Konva.Group>(null);
  return (
    <Group
      ref={ref}
      id={el.id}
      name="element"
      x={el.x}
      y={el.y}
      rotation={el.rotation}
      opacity={el.opacity}
      visible={!el.hidden}
      listening={!el.hidden}
      draggable={!el.locked}
      onMouseDown={(e) => h.onPointerDown(el, e)}
      onDblClick={() => h.onDblClick(el)}
      onDragStart={(e) => h.onDragStart(el, e)}
      onDragMove={(e) => h.onDragMove(el, e)}
      onDragEnd={(e) => h.onDragEnd(el, e)}
      onTransform={() => {
        // Side handles on text change the wrap width instead of stretching the glyphs.
        if (el.type !== "text") return;
        const g = ref.current;
        if (!g) return;
        const anchor = g.getStage()?.findOne<Konva.Transformer>("Transformer")?.getActiveAnchor();
        if (anchor === "middle-left" || anchor === "middle-right") {
          const text = g.findOne<Konva.Text>("Text");
          if (text) text.width(Math.max(20, text.width() * g.scaleX()));
          g.scale({ x: 1, y: 1 });
        }
      }}
      onTransformEnd={() => ref.current && h.onTransformEnd(el, ref.current)}
    >
      <Body el={el} editing={editing} />
    </Group>
  );
}
