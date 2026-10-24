export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** A shortcut as the platform writes it: ⇧⌘G on macOS, Ctrl+Shift+G elsewhere. */
export const shortcut = (key: string, shift = false) => (isMac ? `${shift ? "⇧" : ""}⌘${key}` : `Ctrl+${shift ? "Shift+" : ""}${key}`);
