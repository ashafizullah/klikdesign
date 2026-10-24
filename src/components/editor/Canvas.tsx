// The editing surface: the page (zoom/pan), elements, selection transformer,
// snap guides, marquee selection and in-place text editing.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type Konva from "konva";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Group, Image as KImage, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import { useShallow } from "zustand/react/shallow";
import type { Crop, El, ImageEl, TextEl } from "../../types/design";
import { useDesign } from "../../store/design";
import { notifyError, useUi } from "../../store/ui";
import { bounds, imageCrop, snap, type Box, type Guide } from "../../lib/geometry";
import { registerStage } from "../../lib/stage";
import { importImages, isImagePath } from "../../lib/media";
import { withGroups } from "../../lib/groups";
import { useImage } from "../../lib/images";
import { ElementNode, fillProps, type NodeHandlers } from "./ElementNode";
import { TextToolbar } from "./TextToolbar";
import { CropToolbar } from "./CropToolbar";
import { ElementMenu, openElementMenu } from "./ElementMenu";

const PAD = 48;

/**
 * Clicking the canvas (not a focusable element) does not always take focus out
 * of the field that had it (the chat box, a number field, the in-place text
 * editor) in every webview, and Delete or arrow keys would then go there.
 */
function releaseFocus() {
  const a = document.activeElement;
  if (a instanceof HTMLElement && a !== document.body) a.blur();
}
const TEXT_ANCHORS = ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"];

export function Canvas() {
  const wrap = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const pageRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  /** An element is being dragged; the floating text toolbar hides meanwhile. */
  const [moving, setMoving] = useState(false);
  const dragOrigin = useRef<Map<string, { x: number; y: number }>>(new Map());

  const design = useDesign((s) => s.design);
  const selected = useDesign(useShallow((s) => s.selected));
  const zoomSetting = useUi((s) => s.zoom);
  const editingId = useUi((s) => s.editingTextId);
  const croppingId = useUi((s) => s.croppingId);

  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = size.w ? Math.max(0.02, Math.min((size.w - PAD * 2) / design.width, (size.h - PAD * 2) / design.height)) : 1;
  const zoom = zoomSetting ?? fit;
  useEffect(() => useUi.getState().setFitZoom(fit), [fit]);
  useEffect(() => {
    if (zoomSetting === null) setPan({ x: 0, y: 0 });
  }, [zoomSetting]);

  const origin = { x: (size.w - design.width * zoom) / 2 + pan.x, y: (size.h - design.height * zoom) / 2 + pan.y };
  const toPage = (p: { x: number; y: number }) => ({ x: (p.x - origin.x) / zoom, y: (p.y - origin.y) / zoom });

  // Image files dropped from the Finder/Explorer are copied into the design and placed where they land.
  const [dropping, setDropping] = useState(false);
  const toPageRef = useRef(toPage);
  toPageRef.current = toPage;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let live = true;
    const local = (pos: { x: number; y: number }) => {
      const r = wrap.current?.getBoundingClientRect();
      if (!r) return null;
      const x = pos.x / devicePixelRatio - r.left;
      const y = pos.y / devicePixelRatio - r.top;
      return x >= 0 && y >= 0 && x <= r.width && y <= r.height ? { x, y } : null;
    };
    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "leave") return setDropping(false);
        const at = local(payload.position);
        if (payload.type === "enter" || payload.type === "over") {
          return setDropping(!!at && (payload.type === "over" || payload.paths.some(isImagePath)));
        }
        setDropping(false);
        const images = payload.paths.filter(isImagePath);
        if (at && images.length) importImages(images, toPageRef.current(at)).catch(notifyError);
      })
      .then((fn) => (live ? (unlisten = fn) : fn()))
      .catch(() => {}); // not in the Tauri shell (browser preview)
    return () => {
      live = false;
      unlisten?.();
    };
  }, []);

  // The stage mounts once the viewport has been measured.
  const mounted = size.w > 0;
  useEffect(() => {
    registerStage(stageRef.current, pageRef.current);
    return () => registerStage(null, null);
  }, [mounted]);

  // Attach the transformer to the selected nodes.
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selected
      .filter((id) => id !== editingId && id !== croppingId)
      .map((id) => stage.findOne<Konva.Group>(`#${id}`))
      .filter((n): n is Konva.Group => !!n && n.visible());
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selected, design, editingId, croppingId]);

  const sel = design.elements.filter((e) => selected.includes(e.id));
  const anyLocked = sel.some((e) => e.locked);
  const onlyText = sel.length === 1 && sel[0].type === "text";

  const handlers: NodeHandlers = {
    onPointerDown: (el, e) => {
      e.cancelBubble = true;
      releaseFocus();
      const store = useDesign.getState();
      const additive = e.evt.shiftKey || e.evt.metaKey;
      // A click picks the element's whole group; a double click then picks the element alone.
      const ids = withGroups(store.design.elements, [el.id]);
      if (additive) store.select(store.selected.includes(el.id) ? store.selected.filter((x) => !ids.includes(x)) : [...new Set([...store.selected, ...ids])]);
      else if (!store.selected.includes(el.id)) store.select(ids);
    },
    onDblClick: (el) => {
      const store = useDesign.getState();
      if (el.groupId && !(store.selected.length === 1 && store.selected[0] === el.id)) return store.select([el.id]);
      if (el.locked) return;
      store.select([el.id]);
      if (el.type === "text") useUi.getState().setEditingText(el.id);
      if (el.type === "image") useUi.getState().setCropping(el.id);
    },
    onDragStart: (el) => {
      setMoving(true);
      const store = useDesign.getState();
      const ids = store.selected.includes(el.id) ? store.selected : [el.id];
      dragOrigin.current = new Map(store.design.elements.filter((x) => ids.includes(x.id) && (!x.locked || x.id === el.id)).map((x) => [x.id, { x: x.x, y: x.y }]));
    },
    onDragMove: (el, e) => {
      const node = e.target;
      const start = dragOrigin.current.get(el.id);
      if (!start) return;
      // Snap the dragged element (single selection) to the page and other elements.
      if (dragOrigin.current.size === 1) {
        const others = design.elements.filter((x) => x.id !== el.id && !x.hidden).map((x) => nodeBox(x));
        const b = el.type === "text" ? nodeBox(el) : bounds({ ...el, x: node.x(), y: node.y() });
        const s = snap(b, others, design, 6 / zoom);
        node.position({ x: node.x() + s.dx, y: node.y() + s.dy });
        setGuides(s.guides);
        return;
      }
      // Move the rest of a multi-selection along.
      const dx = node.x() - start.x;
      const dy = node.y() - start.y;
      for (const [id, p] of dragOrigin.current) {
        if (id === el.id) continue;
        stageRef.current?.findOne(`#${id}`)?.position({ x: p.x + dx, y: p.y + dy });
      }
    },
    onDragEnd: () => {
      setMoving(false);
      setGuides([]);
      const stage = stageRef.current;
      const patches = [...dragOrigin.current.keys()].flatMap((id) => {
        const n = stage?.findOne(`#${id}`);
        return n ? [{ id, patch: { x: n.x(), y: n.y() } }] : [];
      });
      dragOrigin.current = new Map();
      useDesign.getState().patchMany(patches);
    },
    onTransformEnd: (el, node) => {
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scale({ x: 1, y: 1 });
      const patch: Partial<El> = { x: node.x(), y: node.y(), rotation: Math.round(node.rotation() * 100) / 100 };
      if (el.type === "text") {
        const text = node.findOne<Konva.Text>("Text");
        const w = (text?.width() ?? el.w) * sx;
        Object.assign(patch, { w: Math.max(20, w), fontSize: Math.max(4, Math.round(el.fontSize * sy * 10) / 10) } satisfies Partial<TextEl>);
      } else {
        Object.assign(patch, { w: Math.max(1, el.w * sx), h: Math.max(1, el.h * sy) });
      }
      useDesign.getState().patch(el.id, patch);
    },
  };

  /** Element box in page coords (text uses its measured height). */
  function nodeBox(el: El): Box {
    if (el.type === "text") {
      const text = stageRef.current?.findOne(`#${el.id}`)?.getClientRect({ relativeTo: pageRef.current ?? undefined });
      if (text) return { x: text.x, y: text.y, w: text.width, h: text.height };
    }
    return bounds(el);
  }

  // ---- stage-level pointer: deselect, marquee, pan, zoom ----

  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && setSpaceDown(true);
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onStageDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    releaseFocus();
    if (croppingId) useUi.getState().setCropping(null);
    if (e.evt.button === 2) return; // the context menu handles right clicks
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    if (spaceDown || e.evt.button === 1) {
      panStart.current = { x: p.x, y: p.y, px: pan.x, py: pan.y };
      return;
    }
    if (e.target !== e.target.getStage() && e.target.name() !== "page-bg") return;
    if (!e.evt.shiftKey) useDesign.getState().select([]);
    marqueeStart.current = p;
  };

  const onStageMove = () => {
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    if (panStart.current) {
      const s = panStart.current;
      if (zoomSetting === null) useUi.getState().setZoom(zoom);
      setPan({ x: s.px + p.x - s.x, y: s.py + p.y - s.y });
      return;
    }
    const s = marqueeStart.current;
    if (s) setMarquee({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };

  const onStageUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    panStart.current = null;
    const m = marquee;
    marqueeStart.current = null;
    setMarquee(null);
    if (!m || m.w < 3 || m.h < 3) return;
    const a = toPage({ x: m.x, y: m.y });
    const r = { x: a.x, y: a.y, w: m.w / zoom, h: m.h / zoom };
    const hit = withGroups(
      design.elements,
      design.elements
        .filter((el) => !el.hidden && !el.locked)
        .filter((el) => {
          const b = nodeBox(el);
          return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
        })
        .map((el) => el.id),
    );
    const cur = useDesign.getState().selected;
    useDesign.getState().select(e.evt.shiftKey ? [...new Set([...cur, ...hit])] : hit);
  };

  const onContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    useUi.getState().setCropping(null);
    const store = useDesign.getState();
    const id = e.target.findAncestor(".element", true)?.id();
    const el = store.design.elements.find((x) => x.id === id);
    // Right-clicking outside the selection selects what is under the pointer (its whole group).
    if (!el) store.select([]);
    else if (!store.selected.includes(el.id)) store.select(withGroups(store.design.elements, [el.id]));
    const p = stageRef.current?.getPointerPosition();
    openElementMenu({ x: e.evt.clientX, y: e.evt.clientY, at: p ? toPage(p) : undefined });
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    if (cropping && !(e.evt.ctrlKey || e.evt.metaKey)) {
      // While cropping, scrolling zooms the photo inside its frame.
      const c = cropping.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
      setCrop(cropping, { ...c, zoom: Math.min(10, Math.max(1, c.zoom * Math.exp(-e.evt.deltaY * 0.002))) });
      return;
    }
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const p = stageRef.current?.getPointerPosition() ?? { x: size.w / 2, y: size.h / 2 };
      const next = Math.min(8, Math.max(0.05, zoom * Math.exp(-e.evt.deltaY * 0.01)));
      const at = toPage(p);
      // Keep the page point under the pointer fixed.
      const ox = p.x - at.x * next;
      const oy = p.y - at.y * next;
      setPan({ x: ox - (size.w - design.width * next) / 2, y: oy - (size.h - design.height * next) / 2 });
      useUi.getState().setZoom(next);
    } else {
      if (zoomSetting === null) useUi.getState().setZoom(zoom);
      setPan((p) => ({ x: p.x - e.evt.deltaX, y: p.y - e.evt.deltaY }));
    }
  };

  const editing = design.elements.find((e) => e.id === editingId && e.type === "text") as TextEl | undefined;
  const cropping = design.elements.find((e) => e.id === croppingId && e.type === "image") as ImageEl | undefined;
  // Cropping ends when the image is deselected or goes away.
  useEffect(() => {
    if (croppingId && (!cropping || !selected.includes(croppingId))) useUi.getState().setCropping(null);
  }, [croppingId, cropping, selected]);
  // The edited text went away (another page opened, undo, the AI): stop editing so shortcuts work again.
  useEffect(() => {
    if (editingId && !editing) useUi.getState().setEditingText(null);
  }, [editingId, editing]);

  return (
    <div ref={wrap} className="checker-soft grain-free min-w-0 flex-1 overflow-hidden" style={{ cursor: spaceDown ? "grab" : undefined }}>
      {size.w > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          onMouseDown={onStageDown}
          onMouseMove={onStageMove}
          onMouseUp={onStageUp}
          onWheel={onWheel}
          onContextMenu={onContextMenu}
        >
          <Layer>
            <Rect x={origin.x} y={origin.y} width={design.width * zoom} height={design.height * zoom} shadowColor="black" shadowBlur={24} shadowOpacity={0.45} fill="#000" listening={false} />
            <Group ref={pageRef} x={origin.x} y={origin.y} scaleX={zoom} scaleY={zoom} clipX={0} clipY={0} clipWidth={design.width} clipHeight={design.height}>
              <Rect name="page-bg" width={design.width} height={design.height} {...fillProps(design.background, design.width, design.height)} />
              {design.elements.map((el) => (
                <ElementNode key={el.id} el={el} editing={el.id === editingId} h={handlers} />
              ))}
              {cropping && <CropOverlay el={cropping} zoom={zoom} />}
            </Group>
          </Layer>
          <Layer>
            <Transformer
              ref={trRef}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              keepRatio={onlyText}
              enabledAnchors={anyLocked ? [] : onlyText ? TEXT_ANCHORS : undefined}
              resizeEnabled={!anyLocked}
              rotateEnabled={!anyLocked}
              anchorSize={9}
              anchorCornerRadius={5}
              anchorStroke="#d9603b"
              borderStroke="#d9603b"
              borderStrokeWidth={1.5}
              padding={2}
              ignoreStroke
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5 ? oldBox : newBox)}
            />
            {guides.map((g, i) =>
              g.orientation === "v" ? (
                <Line key={i} points={[origin.x + g.pos * zoom, 0, origin.x + g.pos * zoom, size.h]} stroke="#ff3d9a" strokeWidth={1} dash={[4, 4]} listening={false} />
              ) : (
                <Line key={i} points={[0, origin.y + g.pos * zoom, size.w, origin.y + g.pos * zoom]} stroke="#ff3d9a" strokeWidth={1} dash={[4, 4]} listening={false} />
              ),
            )}
            {marquee && <Rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(217,96,59,0.12)" stroke="#d9603b" strokeWidth={1} listening={false} />}
          </Layer>
        </Stage>
      )}
      {dropping && <div className="pointer-events-none absolute inset-2 z-30 rounded-xl border-2 border-dashed border-accent bg-accent/5" />}
      {editing && <TextEditor el={editing} origin={origin} zoom={zoom} />}
      {onlyText && !editing && !moving && !marquee && !sel[0].locked && (
        <TextToolbar el={sel[0] as TextEl} />
      )}
      {cropping && <CropToolbar el={cropping} />}
      <ElementMenu />
    </div>
  );
}

export const setCrop = (el: ImageEl, crop: Crop) => useDesign.getState().patch(el.id, { crop });

/**
 * Crop mode for an image: the whole photo shows faded around its frame and is
 * dragged to choose the visible part (scrolling or the toolbar zooms it).
 */
function CropOverlay({ el, zoom }: { el: ImageEl; zoom: number }) {
  const img = useImage(el.src);
  const ref = useRef<Konva.Image>(null);
  // The move cursor set on hover must not outlive crop mode.
  useEffect(() => {
    const stage = ref.current?.getStage();
    return () => void stage?.container().style.removeProperty("cursor");
  }, [img]);
  if (!img) return null;
  const c = imageCrop(img.naturalWidth, img.naturalHeight, el.w, el.h, el.crop);
  const fw = img.naturalWidth * c.scale;
  const fh = img.naturalHeight * c.scale;
  const clamp = (v: number, lo: number) => Math.min(0, Math.max(lo, v));
  return (
    <Group x={el.x} y={el.y} rotation={el.rotation}>
      <KImage
        ref={ref}
        image={img}
        x={-c.x * c.scale}
        y={-c.y * c.scale}
        width={fw}
        height={fh}
        opacity={0.4}
        draggable
        onMouseDown={(e) => void (e.cancelBubble = true)}
        onMouseEnter={(e) => void (e.target.getStage()!.container().style.cursor = "move")}
        onMouseLeave={(e) => void (e.target.getStage()!.container().style.cursor = "")}
        onDblClick={() => useUi.getState().setCropping(null)}
        onDragMove={(e) => {
          const n = e.target;
          const x = clamp(n.x(), el.w - fw);
          const y = clamp(n.y(), el.h - fh);
          n.position({ x, y });
          setCrop(el, { x: fw > el.w ? -x / (fw - el.w) : 0.5, y: fh > el.h ? -y / (fh - el.h) : 0.5, zoom: el.crop?.zoom ?? 1 });
        }}
      />
      <KImage image={img} width={el.w} height={el.h} crop={{ x: c.x, y: c.y, width: c.width, height: c.height }} cornerRadius={el.cornerRadius} listening={false} />
      <Rect width={el.w} height={el.h} stroke="#d9603b" strokeWidth={2 / zoom} cornerRadius={el.cornerRadius} listening={false} />
    </Group>
  );
}

/** Textarea laid over a text element while it is edited in place. */
function TextEditor({ el, origin, zoom }: { el: TextEl; origin: { x: number; y: number }; zoom: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(el.text);
  useLayoutEffect(() => {
    const ta = ref.current!;
    ta.focus();
    ta.select();
  }, []);
  useLayoutEffect(() => {
    const ta = ref.current!;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [value, zoom]);
  const commit = () => {
    // Emptying a text box while editing it removes it, as in other editors.
    if (!value.trim()) useDesign.getState().remove([el.id]);
    else if (value !== el.text) useDesign.getState().patch(el.id, { text: value });
    useUi.getState().setEditingText(null);
  };
  const color = typeof el.fill === "string" ? el.fill : el.fill.colors[0];
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          commit();
        }
      }}
      spellCheck={false}
      className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{
        left: origin.x + el.x * zoom,
        top: origin.y + el.y * zoom,
        width: el.w * zoom,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: "top left",
        fontFamily: `"${el.fontFamily}"`,
        fontSize: el.fontSize * zoom,
        fontWeight: el.fontWeight,
        fontStyle: el.italic ? "italic" : "normal",
        lineHeight: el.lineHeight,
        letterSpacing: el.letterSpacing * zoom,
        textAlign: el.align,
        textTransform: el.uppercase ? "uppercase" : undefined,
        color,
        caretColor: color,
        outline: "1.5px solid #d9603b",
      }}
    />
  );
}
