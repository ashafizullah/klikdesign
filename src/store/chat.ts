import { create } from "zustand";
import type { Message } from "../lib/ipc";

export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; input: Record<string, unknown>; result: string; isError: boolean }
  | { kind: "error"; text: string };

interface ChatState {
  /** Provider-neutral history sent to the model. */
  history: Message[];
  items: ChatItem[];
  busy: boolean;
  set(patch: Partial<Omit<ChatState, "set" | "push" | "reset">>): void;
  push(item: ChatItem): void;
  reset(): void;
}

export const useChat = create<ChatState>()((set) => ({
  history: [],
  items: [],
  busy: false,
  set: (patch) => set(patch),
  push: (item) => set((s) => ({ items: [...s.items, item] })),
  reset: () => set({ history: [], items: [], busy: false }),
}));
