import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newId } from "../lib/ids";
import { t } from "../i18n";
import { ipc } from "../lib/ipc";

export type ApiFormat = "openai" | "anthropic";

/** A text-model connection. Its API key lives in the OS keychain under the profile id. */
export interface AiProfile {
  id: string;
  name: string;
  format: ApiFormat;
  baseUrl: string;
  model: string;
  /** The model accepts images, so the AI can look at its own design. */
  vision?: boolean;
}

export const PROFILE_PRESETS: { label: string; profile: Omit<AiProfile, "id"> }[] = [
  { label: "Anthropic (Claude)", profile: { name: "Claude", format: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-opus-5-5", vision: true } },
  { label: "OpenAI", profile: { name: "OpenAI", format: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5", vision: true } },
  { label: "OpenRouter", profile: { name: "OpenRouter", format: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto", vision: true } },
  { label: "Google Gemini", profile: { name: "Gemini", format: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-pro", vision: true } },
  { label: "xAI (Grok)", profile: { name: "xAI", format: "openai", baseUrl: "https://api.x.ai/v1", model: "grok-4", vision: true } },
  { label: "Groq", profile: { name: "Groq", format: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" } },
  { label: "Ollama (local)", profile: { name: "Ollama", format: "openai", baseUrl: "http://localhost:11434/v1", model: "llama3.1" } },
];

interface SettingsState {
  profiles: AiProfile[];
  activeProfileId: string;
  addProfile(p: Omit<AiProfile, "id">): string;
  updateProfile(id: string, patch: Partial<AiProfile>): void;
  removeProfile(id: string): void;
  setActive(id: string): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => {
      const ai: AiProfile = { id: newId("prof"), ...PROFILE_PRESETS[0].profile };
      return {
        profiles: [ai],
        activeProfileId: ai.id,
        addProfile: (p) => {
          const id = newId("prof");
          set((s) => ({ profiles: [...s.profiles, { id, ...p }] }));
          return id;
        },
        updateProfile: (id, patch) => set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        removeProfile: (id) =>
          set((s) => {
            const profiles = s.profiles.filter((p) => p.id !== id);
            return { profiles, activeProfileId: s.activeProfileId === id ? (profiles[0]?.id ?? "") : s.activeProfileId };
          }),
        setActive: (activeProfileId) => set({ activeProfileId }),
      };
    },
    { name: "klikdesign-settings", version: 1 },
  ),
);

/** Connection fields for the active AI profile, as the Rust commands expect them. */
export function activeModel() {
  const s = useSettings.getState();
  const p = s.profiles.find((x) => x.id === s.activeProfileId) ?? s.profiles[0];
  if (!p) throw new Error(t("err.noProfile"));
  return { format: p.format, profileId: p.id, baseUrl: p.baseUrl || null, model: p.model };
}

/** Whether the app's own AI can run: a key is stored, or the endpoint is local (Ollama and the like). */
export async function aiReady(): Promise<boolean> {
  const s = useSettings.getState();
  const p = s.profiles.find((x) => x.id === s.activeProfileId) ?? s.profiles[0];
  if (!p) return false;
  if (p.format === "openai" && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(p.baseUrl)) return true;
  try {
    return !!(await ipc.apiKeysStatus([p.id]))[p.id];
  } catch {
    return false;
  }
}

export function activeVision(): boolean {
  const s = useSettings.getState();
  return !!(s.profiles.find((x) => x.id === s.activeProfileId) ?? s.profiles[0])?.vision;
}
