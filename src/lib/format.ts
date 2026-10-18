/** Bytes as megabytes, e.g. "1.24 MB". */
export function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}
