// Generates public/llms.txt and public/llms-full.txt from the sidebar in
// .vitepress/config.ts, so the machine-readable docs can't drift from the site.
//
//   node scripts/build-llms.mjs
//
// llms.txt      — the index: every page, grouped, with its description.
// llms-full.txt — every page's content, in sidebar order, as one file.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "public");
const SITE = "https://axle.fifthrevision.com";

const config = readFileSync(join(ROOT, ".vitepress/config.ts"), "utf8");

// The sidebar is the running order of the docs, so it is the running order here.
function sidebar() {
  const sidebarStart = config.indexOf("sidebar: [");
  if (sidebarStart === -1) throw new Error("no sidebar in .vitepress/config.ts");
  const body = config.slice(sidebarStart);
  const groups = [];
  const groupRe = /text:\s*'([^']+)',\s*\n\s*items:\s*\[([\s\S]*?)\]/g;
  let match;
  while ((match = groupRe.exec(body))) {
    const items = [...match[2].matchAll(/\{\s*text:\s*'([^']+)',\s*link:\s*'([^']+)'\s*\}/g)].map(
      (item) => ({ text: item[1], link: item[2] }),
    );
    if (items.length > 0) groups.push({ title: match[1], items });
  }
  if (groups.length === 0) throw new Error("no sidebar groups parsed");
  return groups;
}

function fileFor(link) {
  return join(ROOT, link === "/" ? "index.md" : `${link.replace(/^\//, "")}.md`);
}

function page(link) {
  const raw = readFileSync(fileFor(link), "utf8");
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  const meta = frontmatter?.[1] ?? "";
  const field = (name) => {
    const found = new RegExp(`^${name}:\\s*(.*)$`, "m").exec(meta);
    return found ? found[1].trim().replace(/^['"]|['"]$/g, "") : undefined;
  };
  const body = (frontmatter ? raw.slice(frontmatter[0].length) : raw).replace(
    /^\s*#\s+.*\n/,
    "",
  );
  return { title: field("title"), description: field("description"), body };
}

// VitePress markdown has two constructs a plain reader should not have to parse.
function plain(body) {
  return body
    .replace(/<code v-pre>([\s\S]*?)<\/code>/g, (_, code) => `\`${code}\``)
    .replace(/^:::\s*(\w+)\s*(.*)$/gm, (_, kind, label) => `**${(label || kind).trim()}**`)
    .replace(/^:::\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

const groups = sidebar();
const siteTitle = /title:\s*'([^']+)'/.exec(config)?.[1] ?? "Axle";
const siteDescription = /description:\s*'([^']+)'/.exec(config)?.[1] ?? "";

const index = [`# ${siteTitle}`, "", `> ${siteDescription}`, ""];
index.push(
  "Axle is a library, not a framework: you construct an `Agent` and call",
  "`send()`. It owns no state of yours — sessions are serializable objects and",
  "the transcript is yours to fold and store. Verify any API claim against the",
  "version in your own `package.json`; the surface changed at 0.33, 0.35 and",
  "0.36, and the Upgrading page lists every rename.",
  "",
);

const full = [
  `# ${siteTitle} — full documentation`,
  "",
  `> ${siteDescription}`,
  "",
  `Generated from ${SITE}. Pages appear in the site's own reading order.`,
  "",
];

let pages = 0;
for (const group of groups) {
  index.push(`## ${group.title}`, "");
  for (const item of group.items) {
    const { title, description, body } = page(item.link);
    const url = `${SITE}${item.link}`;
    index.push(`- [${title ?? item.text}](${url})${description ? `: ${description}` : ""}`);
    full.push("---", "", `# ${title ?? item.text}`, "", `Source: ${url}`, "");
    if (description) full.push(`_${description}_`, "");
    full.push(plain(body).trim(), "");
    pages++;
  }
  index.push("");
}

index.push(
  "## For coding agents",
  "",
  `- [AGENTS.md](${SITE}/AGENTS.md): the one-page contract — entry points, what throws versus what returns \`ok: false\`, the tool-loop invariants, and what version drift breaks.`,
  `- [llms-full.txt](${SITE}/llms-full.txt): every page above, as one file.`,
  "",
);

mkdirSync(OUT, { recursive: true });
const indexText = `${index.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
const fullText = `${full.join("\n")}\n`;
writeFileSync(join(OUT, "llms.txt"), indexText);
writeFileSync(join(OUT, "llms-full.txt"), fullText);

const kb = (text) => `${Math.round(text.length / 1024)} KB`;
console.log(`llms.txt:      ${pages} pages, ${kb(indexText)}`);
console.log(`llms-full.txt: ${kb(fullText)}`);
