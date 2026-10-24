import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { t } from "../../i18n";

type Variant = "primary" | "ghost" | "subtle" | "danger";

export function Button({
  variant = "subtle",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-ink font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.4)] hover:brightness-110 active:brightness-95",
    ghost: "text-text hover:bg-panel-2 hover:text-text",
    subtle: "bg-panel-2 text-text hover:bg-line hover:border-muted/40 border border-line",
    danger: "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}

export function IconButton({ title, active, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      title={title}
      aria-label={title}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-panel-2 disabled:opacity-30 ${active ? "bg-accent/10 text-accent" : "text-text"} ${className}`}
      {...rest}
    />
  );
}

/** Number input that commits on blur/Enter so typing doesn't spam history. */
export function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  suffix,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(round(value)));
  useEffect(() => setDraft(String(round(value))), [value]);
  const commit = () => {
    let v = parseFloat(draft);
    if (!Number.isFinite(v)) return setDraft(String(round(value)));
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (v !== value) onChange(v);
    else setDraft(String(round(value)));
  };
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <div className="relative">
        <input
          className="field pr-6"
          type="number"
          step={step}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-muted">{suffix}</span>}
      </div>
    </label>
  );
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  format = (v) => String(round(v)),
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between">
        <span className="label mb-0">{label}</span>
        <span className="text-[11px] text-muted tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        className="w-full accent-[var(--color-accent)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0806]/70 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="flex max-h-[90vh] flex-col overflow-hidden animate-rise rounded-xl border border-line bg-panel shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-serif text-[17px] font-medium tracking-[-0.01em]">{title}</h2>
          <IconButton title={t("common.close")} onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[10px] font-medium tracking-[0.12em] text-muted uppercase">{title}</h3>
        {right}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-[12px] leading-relaxed text-muted">{children}</div>;
}
