// Profiles need the API root (https://host/v1), not a WebSocket or endpoint URL.
const ENDPOINT_SUFFIXES = ["/realtime", "/chat/completions", "/completions", "/audio/speech", "/tts", "/messages", "/responses"];

/** A corrected base URL when `url` looks wrong, or null when it is fine. */
export function suggestBaseUrl(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  let fixed = raw.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
  if (!/^https?:\/\//i.test(fixed)) fixed = `https://${fixed.replace(/^[a-z]+:\/\//i, "")}`;
  fixed = fixed.split("?")[0].replace(/\/+$/, "");
  for (let changed = true; changed; ) {
    changed = false;
    for (const suffix of ENDPOINT_SUFFIXES) {
      if (fixed.toLowerCase().endsWith(suffix)) {
        fixed = fixed.slice(0, -suffix.length);
        changed = true;
      }
    }
  }
  return fixed === raw ? null : fixed;
}
