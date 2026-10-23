import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { FONTS, ensureFont, loadSystemFonts, useFonts, type FontInfo } from "../../lib/fonts";
import { useT } from "../../i18n";

/** Searchable font menu: the curated Google Fonts, then the fonts installed on this computer. */
export function FontPicker({ value, onChange, className = "" }: { value: string; onChange(family: string): void; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const system = useFonts((s) => s.system);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void loadSystemFonts();
    FONTS.forEach((f) => void ensureFont(f.family));
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (f: FontInfo) => !q || f.family.toLowerCase().includes(q);
    return [
      { label: t("font.google"), fonts: FONTS.filter(match) },
      { label: t("font.system", { n: system.length }), fonts: system.filter(match) },
    ].filter((g) => g.fonts.length);
  }, [query, system, t]);

  const pick = (family: string) => {
    onChange(family);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        className="field flex items-center gap-1 text-left"
        style={{ fontFamily: `"${value}"` }}
        onClick={() => setOpen((o) => !o)}
        title={value}
      >
        <span className="min-w-0 flex-1 truncate">{value}</span>
        <ChevronDown size={13} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-40 mt-1 w-full min-w-60 rounded-lg border border-line bg-panel-2 shadow-2xl">
          <div className="flex items-center gap-1.5 border-b border-line px-2">
            <Search size={13} className="shrink-0 text-muted" />
            <input
              autoFocus
              className="w-full bg-transparent py-2 text-[12px] outline-none"
              placeholder={t("font.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                const first = groups[0]?.fonts[0];
                if (e.key === "Enter" && first) pick(first.family);
              }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="sticky top-0 bg-panel-2 px-2.5 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted uppercase">{g.label}</div>
                {g.fonts.map((f) => (
                  <button
                    key={f.family}
                    type="button"
                    onClick={() => pick(f.family)}
                    className={`block w-full truncate px-2.5 py-1 text-left text-[13px] hover:bg-panel ${f.family === value ? "text-accent" : ""}`}
                    style={{ fontFamily: `"${f.family}"` }}
                  >
                    {f.family}
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && <div className="px-2.5 py-3 text-[11px] text-muted">{t("font.none")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
