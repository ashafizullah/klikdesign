import { SIZE_PRESETS } from "../../types/design";
import { useT } from "../../i18n";

/** Size presets as tiles whose outline shows each format's proportions. */
export function SizeTiles({ value, onChange, className = "" }: { value: string | null; onChange(id: string): void; className?: string }) {
  const t = useT();
  return (
    <div className={`grid gap-2 ${className}`}>
      {SIZE_PRESETS.map((p) => {
        const k = 36 / Math.max(p.width, p.height);
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 ${value === p.id ? "border-accent bg-accent/10 text-accent" : "border-line hover:border-muted"}`}
          >
            <div className="flex h-9 items-center"><div className="rounded-sm border border-current" style={{ width: p.width * k, height: p.height * k }} /></div>
            <span className="text-center text-[11px] text-text">{t(`size.${p.id}` as "size.custom")}</span>
            <span className="-mt-1 text-[10px] text-muted">{p.width}×{p.height}</span>
          </button>
        );
      })}
    </div>
  );
}
