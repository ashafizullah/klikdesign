// Right-click menu at the pointer, kept inside the window. Closes on outside
// click, Escape, scroll or window blur.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type MenuItem = { icon: LucideIcon; label: string; run(): void; danger?: boolean; disabled?: boolean; hint?: string } | "sep";
export type MenuState = { x: number; y: number; title?: string; items: MenuItem[] } | null;

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("blur", close);
    };
  }, [menu, onClose]);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
  }, [menu]);

  if (!menu) return null;
  return (
    <div
      ref={ref}
      className="fixed z-[70] min-w-52 rounded-lg border border-line bg-panel py-1 shadow-2xl"
      style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.title && <div className="max-w-64 truncate px-3 pt-1 pb-1.5 text-[10px] text-muted">{menu.title}</div>}
      {menu.items.map((item, i) =>
        item === "sep" ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.run();
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] disabled:opacity-35 ${item.danger ? "text-danger hover:bg-danger/10" : "hover:bg-panel-2"}`}
          >
            <item.icon size={13} className="shrink-0" /> <span className="flex-1">{item.label}</span>
            {item.hint && <span className="pl-4 text-[11px] text-muted">{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
