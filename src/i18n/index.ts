// Lightweight i18n: English (default) and Indonesian.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import en, { type Key } from "./en";
import id from "./id";

export type { Key };
export type Locale = "en" | "id";
export const LOCALES: { id: Locale; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "id", label: "ID" },
];

const dicts: Record<Locale, Record<Key, string>> = { en, id };

export const useLocale = create<{ locale: Locale; setLocale(l: Locale): void }>()(
  persist((set) => ({ locale: "en", setLocale: (locale) => set({ locale }) }), { name: "klikdesign-locale" }),
);

export type Vars = Record<string, string | number>;

export function translate(locale: Locale, key: Key, vars?: Vars): string {
  const text = dicts[locale][key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Non-reactive lookup for code outside React components. */
export const t = (key: Key, vars?: Vars) => translate(useLocale.getState().locale, key, vars);

/** Reactive lookup: components re-render when the locale changes. */
export function useT() {
  const locale = useLocale((s) => s.locale);
  return (key: Key, vars?: Vars) => translate(locale, key, vars);
}

// Backend (Rust) errors are English; map the known ones for Indonesian.
const BACKEND_ID: [RegExp, string][] = [
  [/^This profile has no API key yet \(AI Settings\)$/, "API key profil ini belum diisi (Pengaturan AI)"],
  [/^Invalid profile id$/, "ID profil tidak valid"],
  [/^Invalid id$/, "ID tidak valid"],
  [/^Folder not found$/, "Folder tidak ditemukan"],
  [/^Choose a folder$/, "Pilih folder"],
  [/^Workspace not found$/, "Folder project tidak ditemukan"],
  [/^Workspace folder not found$/, "Folder project tidak ditemukan"],
  [/^Paths outside the workspace are not allowed$/, "Path di luar folder project tidak diizinkan"],
  [/^Not found: (.*)$/, "Tidak ditemukan: $1"],
  [/^This file holds credentials and cannot be read$/, "File ini berisi kredensial dan tidak boleh dibaca"],
  [/^Binary files cannot be read as text$/, "File biner tidak bisa dibaca sebagai teks"],
  [/^Not a supported image file$/, "Bukan file gambar yang didukung"],
  [/^Could not load image (.*)$/, "Gagal memuat gambar $1"],
  [/^The canvas is not ready$/, "Kanvas belum siap"],
  [/^Unknown API format: (.*)$/, "Format API tidak dikenal: $1"],
  [/^Anthropic: (.*)$/s, "Anthropic menolak permintaan: $1"],
  [/^HTTP (\d+)([^:]*): (.*)$/s, "Permintaan gagal (HTTP $1$2): $3"],
  [/^File is too large to load into memory$/, "File terlalu besar untuk dimuat"],
  [/^No such file or directory \(os error 2\)$/, "File atau folder tidak ditemukan"],
  [/^error sending request for url (.*)$/s, "Gagal menghubungi server $1. Periksa koneksi internet atau Base URL."],
  [/^operation timed out$/i, "Waktu tunggu habis. Coba lagi."],
  [/^Base URL must start with http:\/\/ or https:\/\/ \(got (.*)\)\. For xAI use (.*)$/, "Base URL harus diawali http:// atau https:// (sekarang $1). Untuk xAI pakai $2"],
];

export function localizeMessage(message: string): string {
  if (useLocale.getState().locale !== "id") return message;
  for (const [re, out] of BACKEND_ID) if (re.test(message)) return message.replace(re, out);
  return message;
}
