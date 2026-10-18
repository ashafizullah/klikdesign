// Chooses the project folder the AI researches (or none).
import { FolderGit2, FolderPlus } from "lucide-react";
import { useApp } from "../../store/app";
import { notifyError } from "../../store/ui";
import { addWorkspace } from "../../lib/workspace";
import { useT } from "../../i18n";

export function ProjectPicker({ value, onChange, disabled }: { value: string | null; onChange(id: string | null): void; disabled?: boolean }) {
  const t = useT();
  const workspaces = useApp((s) => s.workspaces);
  const add = () =>
    addWorkspace()
      .then((ws) => ws && onChange(ws.id))
      .catch(notifyError);
  return (
    <div className="flex items-center gap-1.5">
      <FolderGit2 size={14} className={value ? "shrink-0 text-accent" : "shrink-0 text-muted"} />
      <select
        className="field min-w-0 flex-1"
        value={value ?? ""}
        disabled={disabled}
        title={workspaces.find((w) => w.id === value)?.path}
        onChange={(e) => (e.target.value === "__add" ? add() : onChange(e.target.value || null))}
      >
        <option value="">{t("ws.none")}</option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
        <option value="__add">{t("ws.addOption")}</option>
      </select>
      <button className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-text disabled:opacity-40" title={t("ws.add")} disabled={disabled} onClick={add}>
        <FolderPlus size={15} />
      </button>
    </div>
  );
}
