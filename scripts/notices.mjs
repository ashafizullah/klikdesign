// Writes THIRD_PARTY_NOTICES.md with the license of every third-party package
// shipped in KlikDesign: the frontend's npm packages (with everything they pull
// in, including the bundled interface fonts) and the Rust crates compiled into
// the app for macOS, Windows and Linux. The app shows the file under Settings →
// Open-source licenses.
// Fails when a package's license is not on the allow-list below, so a copyleft
// dependency can't slip in unnoticed. Run with `bun run notices` after
// changing dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

// Permissive licenses (MPL-2.0 is file-level copyleft: fine for unmodified
// crates whose source is public on crates.io, as in every Tauri app).
const ALLOWED = new Set([
  "MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Zlib", "0BSD", "Unlicense",
  "Unicode-3.0", "Unicode-DFS-2016", "CC0-1.0", "BSL-1.0", "OFL-1.1", "MPL-2.0",
]);

/** Evaluates an SPDX expression ("MIT OR Apache-2.0", "(A OR B) AND C", "X WITH exception", "MIT/Apache-2.0"). */
export function allowed(expr) {
  const tokens = expr.replace(/\//g, " OR ").replace(/\(/g, " ( ").replace(/\)/g, " ) ").split(/\s+/).filter(Boolean);
  let i = 0;
  const atom = () => {
    const tok = tokens[i++];
    if (tok === "(") {
      const v = or();
      i++; // ")"
      return v;
    }
    if (tokens[i] === "WITH") i += 2; // exceptions only add permissions
    return ALLOWED.has(tok);
  };
  const and = () => {
    let v = atom();
    while (tokens[i] === "AND") {
      i++;
      v = atom() && v;
    }
    return v;
  };
  const or = () => {
    let v = and();
    while (tokens[i] === "OR") {
      i++;
      v = and() || v;
    }
    return v;
  };
  return or();
}

const problems = [];

/** Plain code-point order (not locale-aware), so every machine sorts the same. */
function byNameVersion(a, b) {
  const x = `${a.name}@${a.version}`;
  const y = `${b.name}@${b.version}`;
  return x < y ? -1 : x > y ? 1 : 0;
}

function licenseFiles(dir) {
  // Sorted, so the notices come out the same whatever order the file system lists them in.
  return readdirSync(dir)
    .filter((f) => /^(licen[cs]e|copying|notice)/i.test(f) && !/\.(rs|js|ts|json)$/i.test(f))
    .sort();
}

/** License text for a package; prefers the MIT file of dual-licensed packages. */
function licenseText(dir, expr, name) {
  const files = licenseFiles(dir);
  const mit = files.find((f) => /^licen[cs]e[-_.]?mit/i.test(f));
  const pick = /\bMIT\b/.test(expr) && mit ? [mit] : files.filter((f) => !/^licen[cs]e[-_.]?(apache|bsd|zlib|unlicense)/i.test(f) || files.length === 1);
  const chosen = pick.length ? pick : files;
  if (!chosen.length) return null;
  return chosen.map((f) => readFileSync(join(dir, f), "utf8").trim()).join("\n\n");
}

function mitText(holder) {
  return `MIT License

Copyright (c) ${holder}

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
SOFTWARE.`;
}

// ---- npm ------------------------------------------------------------------

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const npm = new Map();

function walk(name, from) {
  // Type declarations are erased at build time; nothing of them ships.
  if (name.startsWith("@types/")) return;
  const candidates = [join(from, "node_modules", name), join(root, "node_modules", name)];
  const dir = candidates.find((d) => existsSync(join(d, "package.json")));
  if (!dir) return;
  const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const key = `${name}@${meta.version}`;
  if (npm.has(key)) return;
  const license = typeof meta.license === "string" ? meta.license : (meta.licenses ?? []).map((l) => l.type).join(" OR ");
  const author = typeof meta.author === "string" ? meta.author : meta.author?.name;
  npm.set(key, { name, version: meta.version, license, dir, author });
  for (const dep of Object.keys({ ...meta.dependencies, ...meta.optionalDependencies })) walk(dep, dir);
}
for (const dep of Object.keys(pkg.dependencies)) walk(dep, root);

const npmParts = [];
for (const p of [...npm.values()].sort(byNameVersion)) {
  if (!allowed(p.license)) problems.push(`npm ${p.name}@${p.version}: ${p.license}`);
  let text = licenseText(p.dir, p.license, p.name) ?? MISSING[p.name] ?? null;
  // Tauri's plugins ship only an SPDX file; their MIT text is the Tauri project's.
  if (!text && p.name.startsWith("@tauri-apps/")) text = licenseText(join(root, "node_modules/@tauri-apps/api"), "MIT", p.name);
  // A few MIT packages publish no license file; the license terms still apply.
  if (!text && p.license === "MIT") text = mitText(p.author ?? `the ${p.name} authors`);
  if (!text) problems.push(`npm ${p.name}@${p.version}: no license text`);
  npmParts.push(`### ${p.name} ${p.version} (${p.license})\n\n\`\`\`\n${text}\n\`\`\``);
}

// ---- Rust -----------------------------------------------------------------

const crates = new Map();
for (const target of ["aarch64-apple-darwin", "x86_64-apple-darwin", "x86_64-pc-windows-msvc", "x86_64-unknown-linux-gnu"]) {
  const meta = JSON.parse(
    execFileSync("cargo", ["metadata", "--format-version", "1", "--manifest-path", join(root, "src-tauri/Cargo.toml"), "--filter-platform", target], {
      maxBuffer: 256 * 1024 * 1024,
    }).toString(),
  );
  const packages = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const rootId = meta.resolve.root;
  const stack = [rootId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    // Normal dependencies only: build scripts and tests are not shipped.
    for (const dep of nodes.get(id).deps) if (dep.dep_kinds.some((k) => k.kind === null)) stack.push(dep.pkg);
  }
  seen.delete(rootId);
  for (const id of seen) {
    const p = packages.get(id);
    crates.set(`${p.name}@${p.version}`, {
      name: p.name,
      version: p.version,
      license: p.license ?? "",
      dir: dirname(p.manifest_path),
      authors: p.authors.map((a) => a.replace(/\s*<[^>]*>/, "")),
      repository: p.repository,
    });
  }
}

const sortedCrates = [...crates.values()].sort(byNameVersion);
for (const c of sortedCrates) c.text = licenseText(c.dir, c.license, c.name);

// License texts that name no copyright holder, so any copy of them is the right one.
const STANDARD = new Set(["Apache-2.0", "BSL-1.0", "MPL-2.0"]);

/** Text for a crate published without a license file. */
function fallbackText(c) {
  // A sibling crate from the same repository under the same license.
  const sibling = sortedCrates.find((o) => o.text && o.license === c.license && o.repository && o.repository === c.repository);
  if (sibling) return sibling.text;
  if (/\bMIT\b/.test(c.license)) return mitText(c.authors.length ? c.authors.join(", ") : `the ${c.name} authors`);
  const standard = STANDARD.has(c.license) && sortedCrates.find((o) => o.text && o.license === c.license);
  if (standard) return standard.text;
  return `Licensed under ${c.license}. See https://crates.io/crates/${c.name}.`;
}

const groups = new Map();
for (const c of sortedCrates) {
  if (!c.license || !allowed(c.license)) problems.push(`crate ${c.name}@${c.version}: ${c.license || "no license field"}`);
  const text = c.text ?? fallbackText(c);
  const key = `${c.license}\n${text}`;
  if (!groups.has(key)) groups.set(key, { license: c.license, text, names: [], sources: new Set() });
  const g = groups.get(key);
  g.names.push(`${c.name} ${c.version}`);
  if (c.repository) g.sources.add(c.repository);
}
// MPL-2.0 (section 3.2) asks binaries to say where the source is; KlikDesign uses these crates unmodified.
const sourceLine = (g) => (/^MPL-2\.0$/.test(g.license) && g.sources.size ? `Source code: ${[...g.sources].join(", ")}\n\n` : "");
const rustParts = [...groups.values()].map((g) => `### ${g.names.join(", ")} (${g.license})\n\n${sourceLine(g)}\`\`\`\n${g.text}\n\`\`\``);

if (problems.length) {
  console.error(`License check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

// Some license files use CRLF; write LF everywhere so the output is the same on every OS.
const notices = `# Third-party notices\n\nKlikDesign includes the following third-party software. Each is used under its own license, reproduced below. Fonts loaded from Google Fonts are licensed under the SIL Open Font License; fonts installed on your computer keep their own licenses.\n\n## Interface (JavaScript)\n\n${npmParts.join("\n\n")}\n\n## Desktop app (Rust crates)\n\n${rustParts.join("\n\n")}\n`;
writeFileSync(join(root, "THIRD_PARTY_NOTICES.md"), notices.replace(/\r\n?/g, "\n"));
console.log(`THIRD_PARTY_NOTICES.md: ${npm.size} npm packages, ${crates.size} crates`);
