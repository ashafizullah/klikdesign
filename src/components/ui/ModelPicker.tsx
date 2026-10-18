import { Settings2 } from "lucide-react";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { useT } from "../../i18n";

/** Compact AI profile selector shown above AI inputs. */
export function ModelPicker() {
  const t = useT();
  const { profiles, activeProfileId, setActive } = useSettings();
  const open = useUi((s) => s.open);
  return (
    <div className="flex items-center gap-1.5">
      <select className="field flex-1" value={activeProfileId} onChange={(e) => setActive(e.target.value)}>
        {profiles.length === 0 && <option value="">{t("picker.none")}</option>}
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.model}
          </option>
        ))}
      </select>
      <button className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-text" title={t("picker.settings")} onClick={() => open("settings")}>
        <Settings2 size={15} />
      </button>
    </div>
  );
}
