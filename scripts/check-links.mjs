// Verifies every absolute internal link resolves to a page, and every #fragment
// resolves to a heading on that page. VitePress checks the first; nothing checks
// the second, and moved headings are the usual way anchors rot.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

// Contributor guidance, not site content.
const EXCLUDED_DOCS = new Set(["LLM-CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".vitepress", ".snippet-check", ".git", "scripts"].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".md") && !EXCLUDED_DOCS.has(name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT).sort();
const pages = new Map();
for (const full of files) {
  const rel = relative(ROOT, full).replace(/\.md$/, "");
  pages.set(rel === "index" ? "/" : `/${rel}`, full);
}

function anchors(full) {
  const out = new Set();
  for (const line of readFileSync(full, "utf8").split("\n")) {
    const m = /^#{2,4}\s+(.*)/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/<[^>]+>/g, "").replace(/`/g, "").toLowerCase();
    out.add(text.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-"));
  }
  return out;
}

const anchorMap = new Map([...pages].map(([slug, full]) => [slug, anchors(full)]));

const problems = [];
for (const full of files) {
  const rel = relative(ROOT, full);
  const text = readFileSync(full, "utf8");
  for (const m of text.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    const [path, fragment] = m[1].split("#");
    const slug = path.replace(/\/$/, "") || "/";
    if (!pages.has(slug)) problems.push(`${rel}  →  ${m[1]}  (no such page)`);
    else if (fragment && !anchorMap.get(slug).has(fragment)) {
      problems.push(`${rel}  →  ${m[1]}  (no such anchor)`);
    }
  }
}

console.log(`${files.length} pages, ${problems.length} broken links`);
for (const p of problems) console.log(`  ${p}`);
process.exitCode = problems.length > 0 ? 1 : 0;
