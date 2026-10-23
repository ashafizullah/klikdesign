import { useEffect, useState } from "react";
import { Check, CircleDot, ListRestart, Loader2, Trash2, Zap } from "lucide-react";
import { EFFORTS, PROFILE_PRESETS, useSettings, type AiProfile, type ApiFormat, type Effort } from "../../store/settings";
import { notifyError, useUi } from "../../store/ui";
import { ipc } from "../../lib/ipc";
import { suggestBaseUrl } from "../../lib/baseUrl";
import { Button, Modal } from "../ui";
import { LanguageToggle } from "../ui/LanguageToggle";
import { localizeMessage, useT } from "../../i18n";

export function SettingsDialog() {
  const t = useT();
  const close = () => useUi.getState().open(null);
  const s = useSettings();
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const refresh = () => ipc.apiKeysStatus(useSettings.getState().profiles.map((p) => p.id)).then(setKeys).catch(notifyError);
  useEffect(() => void refresh(), [s.profiles.length]);

  return (
    <Modal title={t("settings.title")} onClose={close} width={800}>
      <div className="mb-4 flex items-center justify-end gap-2 text-[12px] text-muted">
        {t("settings.appLanguage")} <LanguageToggle />
      </div>
      <AiTab keys={keys} refresh={refresh} />
    </Modal>
  );
}

function ProfileList<P extends { id: string; name: string }>({
  items, activeId, selectedId, onSelect, subtitle, keys, presets, onAdd, heading,
}: {
  items: P[];
  activeId: string;
  selectedId: string;
  onSelect(id: string): void;
  subtitle(p: P): string;
  keys: Record<string, boolean>;
  presets: string[];
  onAdd(preset: string): void;
  heading: string;
}) {
  const t = useT();
  return (
    <div className="space-y-1">
      <div className="label">{heading}</div>
      {items.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${selectedId === p.id ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
        >
          <CircleDot size={12} className={activeId === p.id ? "text-accent" : "text-transparent"} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{p.name}</span>
            <span className="block truncate text-[10px] text-muted">{subtitle(p)}</span>
          </span>
          {keys[p.id] && <Check size={12} className="text-accent" />}
        </button>
      ))}
      <select className="field mt-2" value="" onChange={(e) => e.target.value && onAdd(e.target.value)}>
        <option value="">{t("settings.addProfile")}</option>
        {presets.map((label) => <option key={label} value={label}>{label}</option>)}
      </select>
    </div>
  );
}

function BaseUrlField({ value, placeholder, onChange }: { value: string; placeholder: string; onChange(v: string): void }) {
  const t = useT();
  const fix = suggestBaseUrl(value);
  return (
    <label className="block">
      <span className="label">{t("settings.baseUrl")}</span>
      <input className="field" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {fix && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-danger/10 px-2 py-1.5 text-[11px] text-danger">
          <span>{t("settings.baseUrlInvalid")}</span>
          <button className="rounded bg-danger/20 px-1.5 py-0.5 font-medium hover:bg-danger/30" onClick={() => onChange(fix)}>
            {t("settings.baseUrlUse", { url: fix })}
          </button>
        </div>
      )}
    </label>
  );
}

function KeyField({ id, hasKey, onChange }: { id: string; hasKey: boolean; onChange(): void }) {
  const t = useT();
  const [key, setKey] = useState("");
  const save = async () => {
    try {
      await ipc.apiKeySet(id, key);
      setKey("");
      onChange();
      useUi.getState().notify(t("settings.keyStored"));
    } catch (e) {
      notifyError(e);
    }
  };
  return (
    <label className="block">
      <span className="label">{t("settings.apiKey")} {hasKey && <span className="text-accent normal-case">{t("settings.keySaved")}</span>}</span>
      <div className="flex gap-1.5">
        <input
          type="password"
          className="field"
          autoComplete="off"
          placeholder={hasKey ? t("settings.keyReplace") : t("settings.keyPaste")}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button onClick={save} disabled={!key}>{t("common.save")}</Button>
        {hasKey && (
          <Button variant="danger" title={t("settings.deleteKey")} onClick={() => ipc.apiKeyDelete(id).then(onChange).catch(notifyError)}>
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </label>
  );
}

function ModelField({ profile, onChange }: { profile: AiProfile; onChange(model: string): void }) {
  const t = useT();
  const [models, setModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A list fetched for another endpoint no longer applies.
  useEffect(() => setModels(null), [profile.format, profile.baseUrl]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = await ipc.models({ format: profile.format, profileId: profile.id, baseUrl: profile.baseUrl || null });
      setModels(ids);
      if (!ids.length) setError(t("settings.modelsEmpty"));
    } catch (e) {
      setError(localizeMessage(String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <label className="block">
      <span className="label">{t("settings.model")}</span>
      <div className="flex gap-1.5">
        <input className="field" value={profile.model} onChange={(e) => onChange(e.target.value)} />
        <Button className="shrink-0 whitespace-nowrap" onClick={load} disabled={loading} title={t("settings.modelsLoadHint")}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <ListRestart size={13} />} {t("settings.modelsLoad")}
        </Button>
      </div>
      {!!models?.length && (
        <select className="field mt-1.5" value={models.includes(profile.model) ? profile.model : ""} onChange={(e) => e.target.value && onChange(e.target.value)}>
          <option value="">{t("settings.modelsPick", { n: models.length })}</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
      {error && <div className="mt-1.5 rounded-md bg-danger/10 px-2 py-1.5 text-[11px] text-danger whitespace-pre-wrap">{error}</div>}
    </label>
  );
}

function TestResult({ value }: { value: string | null }) {
  const t = useT();
  if (!value || value === "run") return null;
  const ok = value === "ok";
  return (
    <div className={`rounded-md px-3 py-2 text-[11px] whitespace-pre-wrap ${ok ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"}`}>
      {ok ? t("settings.testOk") : value}
    </div>
  );
}

// ---------------------------------------------------------------- AI profiles

function AiTab({ keys, refresh }: { keys: Record<string, boolean>; refresh(): void }) {
  const t = useT();
  const s = useSettings();
  const [selected, setSelected] = useState(s.activeProfileId || s.profiles[0]?.id || "");
  const profile = s.profiles.find((p) => p.id === selected);
  return (
    <div className="grid grid-cols-[220px_1fr] gap-4">
      <ProfileList
        heading={t("settings.profiles")}
        items={s.profiles}
        activeId={s.activeProfileId}
        selectedId={selected}
        onSelect={setSelected}
        subtitle={(p) => `${t(p.format === "anthropic" ? "settings.anthropic" : "settings.openaiCompatible")} · ${p.model}`}
        keys={keys}
        presets={PROFILE_PRESETS.map((p) => p.label)}
        onAdd={(label) => setSelected(s.addProfile({ ...PROFILE_PRESETS.find((p) => p.label === label)!.profile }))}
      />
      {profile ? <AiEditor key={profile.id} profile={profile} hasKey={!!keys[profile.id]} onKeyChange={refresh} /> : <p className="text-[12px] text-muted">{t("settings.empty")}</p>}
    </div>
  );
}

function AiEditor({ profile, hasKey, onKeyChange }: { profile: AiProfile; hasKey: boolean; onKeyChange(): void }) {
  const t = useT();
  const s = useSettings();
  const [testing, setTesting] = useState<string | null>(null);
  const update = (patch: Partial<AiProfile>) => s.updateProfile(profile.id, patch);
  const active = s.activeProfileId === profile.id;

  const test = async () => {
    setTesting("run");
    try {
      const res = await ipc.chat({
        format: profile.format,
        profileId: profile.id,
        baseUrl: profile.baseUrl || null,
        model: profile.model,
        effort: profile.effort ?? null,
        maxTokens: 512,
        messages: [{ role: "user", content: [{ type: "text", text: "Reply with the single word OK." }] }],
      });
      const text = res.message.content.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
      setTesting(text ? "ok" : t("settings.testEmpty", { reason: res.stopReason }));
    } catch (e) {
      setTesting(localizeMessage(String(e)));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-muted">{t("settings.aiIntro")}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">{t("settings.name")}</span>
          <input className="field" value={profile.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">{t("settings.format")}</span>
          <select
            className="field"
            value={profile.format}
            onChange={(e) => {
              const format = e.target.value as ApiFormat;
              update({ format, effort: profile.effort && EFFORTS[format].includes(profile.effort) ? profile.effort : undefined });
            }}
          >
            <option value="openai">{t("settings.openaiCompatible")}</option>
            <option value="anthropic">{t("settings.anthropic")}</option>
          </select>
        </label>
      </div>
      <BaseUrlField
        value={profile.baseUrl}
        placeholder={profile.format === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"}
        onChange={(baseUrl) => update({ baseUrl })}
      />
      <ModelField profile={profile} onChange={(model) => update({ model })} />
      <label className="block">
        <span className="label">{t("settings.effort")}</span>
        <select className="field" value={profile.effort ?? ""} onChange={(e) => update({ effort: (e.target.value || undefined) as Effort | undefined })}>
          <option value="">{t("settings.effortDefault")}</option>
          {EFFORTS[profile.format].map((e) => <option key={e} value={e}>{t(`settings.effort.${e}`)}</option>)}
        </select>
        <span className="mt-1 block text-[10px] text-muted">{t("settings.effortHint")}</span>
      </label>
      <KeyField id={profile.id} hasKey={hasKey} onChange={onKeyChange} />
      <label className="flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={!!profile.vision} onChange={(e) => update({ vision: e.target.checked || undefined })} />
        {t("settings.vision")}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={active ? "subtle" : "primary"} disabled={active} onClick={() => s.setActive(profile.id)}>
          {t(active ? "settings.active" : "settings.makeActive")}
        </Button>
        <Button onClick={test} disabled={testing === "run"}>
          {testing === "run" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} {t("settings.test")}
        </Button>
        <Button variant="danger" onClick={() => ipc.apiKeyDelete(profile.id).finally(() => s.removeProfile(profile.id))}>
          <Trash2 size={13} /> {t("settings.deleteProfile")}
        </Button>
      </div>
      <TestResult value={testing} />
      <p className="text-[11px] leading-relaxed text-muted">{t("settings.note")}</p>
    </div>
  );
}
