import { useEffect, useRef, useState } from "react";

const DELAY = 350;

/** The element under the pointer (disabled ones included) that carries a tooltip. */
function tipTarget(x: number, y: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const tip = (el as HTMLElement).closest?.("[title], [data-tip]") as HTMLElement | null;
    if (tip) return tip;
  }
  return null;
}

/**
 * App-wide tooltips. Native `title` tooltips in the macOS WebView are slow or
 * missing (and never show on disabled buttons), so every `title` is moved to
 * `data-tip` and rendered here instead.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;

    const clear = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = tipTarget(e.clientX, e.clientY);
        if (el) {
          // Take over the native tooltip.
          const native = el.getAttribute("title");
          if (native) {
            el.setAttribute("data-tip", native);
            el.removeAttribute("title");
          }
        }
        if (el === current) return;
        clear();
        const text = el?.getAttribute("data-tip");
        if (!el || !text) return;
        current = el;
        timer = setTimeout(() => setTip({ text, rect: el.getBoundingClientRect() }), DELAY);
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", clear);
    window.addEventListener("wheel", clear, { passive: true });
    window.addEventListener("keydown", clear);
    window.addEventListener("blur", clear);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", clear);
      window.removeEventListener("wheel", clear);
      window.removeEventListener("keydown", clear);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // Below the element, flipped above near the bottom, kept inside the window.
  useEffect(() => {
    if (!tip || !box.current) return setPos(null);
    const b = box.current.getBoundingClientRect();
    const margin = 6;
    let left = tip.rect.left + tip.rect.width / 2 - b.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - b.width - margin));
    let top = tip.rect.bottom + margin;
    if (top + b.height > window.innerHeight - margin) top = tip.rect.top - b.height - margin;
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={box}
      role="tooltip"
      className="pointer-events-none fixed z-[100] max-w-72 rounded-md border border-line bg-[#26282d] px-2 py-1 text-[11px] leading-snug text-text shadow-lg"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {tip.text}
    </div>
  );
}
