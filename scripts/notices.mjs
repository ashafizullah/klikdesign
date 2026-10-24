// Writes THIRD_PARTY_NOTICES.md: the license of every package bundled into the
// app's frontend (the app shows it under Settings → Open-source licenses).
// Run with `bun run notices` after changing dependencies.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Packages whose npm release has no license file: the text from their source headers. */
const MISSING = {
  "qrcode-generator": `MIT License

Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The word "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
http://www.denso-wave.com/qrcode/faqpatent-e.html`,
};

const root = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function licenseText(dir, name) {
  const files = readdirSync(dir);
  // Dual-licensed packages (MIT OR Apache-2.0) are used under MIT.
  const file = files.find((f) => /^licen[cs]e-mit/i.test(f)) ?? files.find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
  if (file) return readFileSync(join(dir, file), "utf8").trim();
  if (MISSING[name]) return MISSING[name];
  // Tauri's plugins ship only an SPDX file; their MIT text is the Tauri project's.
  if (name.startsWith("@tauri-apps/")) return licenseText(join(root, "node_modules/@tauri-apps/api"), "@tauri-apps/api");
  throw new Error(`No license text for ${name}`);
}

const parts = Object.keys(pkg.dependencies)
  .sort()
  .map((name) => {
    const dir = join(root, "node_modules", name);
    if (!existsSync(dir)) throw new Error(`${name} is not installed`);
    const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return `## ${name} ${meta.version} (${meta.license})\n\n\`\`\`\n${licenseText(dir, name)}\n\`\`\``;
  });

writeFileSync(
  join(root, "THIRD_PARTY_NOTICES.md"),
  `# Third-party notices\n\nKlikDesign includes the following open-source software. Fonts loaded from Google Fonts are licensed under the SIL Open Font License; fonts installed on your computer keep their own licenses.\n\n${parts.join("\n\n")}\n`,
);
console.log(`THIRD_PARTY_NOTICES.md: ${parts.length} packages`);
