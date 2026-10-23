// In-app replacement for the native confirm dialog, driven by `confirm()` in the UI store.
import { Button, Modal } from "../ui";
import { useT } from "../../i18n";
import { useUi } from "../../store/ui";

export function ConfirmDialog() {
  const t = useT();
  const c = useUi((s) => s.confirm);
  if (!c) return null;
  return (
    <Modal title={c.title} onClose={() => c.resolve(false)} width={400}>
      <p className="text-[12px] leading-relaxed text-muted">{c.message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => c.resolve(false)}>{t("common.cancel")}</Button>
        <Button variant={c.danger ? "danger" : "primary"} autoFocus onClick={() => c.resolve(true)}>
          {c.confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
