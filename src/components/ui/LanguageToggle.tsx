import { LOCALES, useLocale } from "../../i18n";

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex overflow-hidden rounded-md border border-line text-[11px]">
      {LOCALES.map((l) => (
        <button
          key={l.id}
          onClick={() => setLocale(l.id)}
          className={`px-2 py-1 ${locale === l.id ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
