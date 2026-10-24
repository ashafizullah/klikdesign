// QR codes via qrcode-generator (MIT; "QR Code" is a registered trademark of
// DENSO WAVE INCORPORATED). Drawn as vector path data so they stay sharp at
// any size and in every export.
import qrcode from "qrcode-generator";

// Byte mode as UTF-8, so links with non-Latin text scan correctly.
qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));

/** Modules of quiet zone around the code (the standard asks for 4; 2 scans fine on a solid background). */
export const QR_MARGIN = 2;

const cache = new Map<string, { size: number; path: string } | null>();

/**
 * The code for `data` as path data in module units (0…size, quiet zone
 * included), or null when the data is too long for a QR code.
 */
export function qrPath(data: string): { size: number; path: string } | null {
  let hit = cache.get(data);
  if (hit !== undefined) return hit;
  try {
    const q = qrcode(0, "M");
    q.addData(data);
    q.make();
    const count = q.getModuleCount();
    let path = "";
    for (let r = 0; r < count; r++) {
      // One rectangle per horizontal run of dark modules.
      for (let c = 0; c < count; c++) {
        if (!q.isDark(r, c)) continue;
        let end = c;
        while (end + 1 < count && q.isDark(r, end + 1)) end++;
        path += `M${c + QR_MARGIN} ${r + QR_MARGIN}h${end - c + 1}v1h${-(end - c + 1)}z`;
        c = end;
      }
    }
    hit = { size: count + 2 * QR_MARGIN, path };
  } catch {
    hit = null;
  }
  if (cache.size > 50) cache.clear();
  cache.set(data, hit);
  return hit;
}

/**
 * A WhatsApp chat link for a phone number. A local Indonesian number
 * (08…) gets the country code 62.
 */
export function waLink(phone: string, text = ""): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  // The message is kept as typed (trimming would eat the space being typed).
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** The number and message of a link made by `waLink`, or null for other data. */
export function parseWaLink(data: string): { phone: string; text: string } | null {
  const m = /^https:\/\/wa\.me\/(\d*)(?:\?text=(.*))?$/.exec(data);
  if (!m) return null;
  try {
    return { phone: m[1], text: m[2] ? decodeURIComponent(m[2]) : "" };
  } catch {
    return { phone: m[1], text: "" };
  }
}
