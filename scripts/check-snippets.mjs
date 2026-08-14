// Extracts fenced TypeScript from the docs and type-checks each block against
// the published @fifthrevision/axle types.
//
// Snippets are illustrative, so two classes of diagnostic are expected and
// filtered out: undefined placeholder identifiers (provider, model, apiKey, …),
// and blocks that are syntactic fragments — an object method lifted out of its
// object, say. Everything else is a real defect in the docs.
//
//   node scripts/check-snippets.mjs            # report real errors
//   SHOW_FRAGMENTS=1 node scripts/check-snippets.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const WORK = join(ROOT, ".snippet-check");

// Contributor guidance, not site content.
const EXCLUDED_DOCS = new Set(["LLM-CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md"]);

// Identifiers the docs deliberately leave undefined.
const PLACEHOLDER = /^(provider|model|apiKey|agent|instruct|schema|messages|previousMessages|newMessages|tools|myTool|getWeather|searchTool|webSearchTool|myLocalTool|myDatabaseTool|readFile|showChart|research|researcher|compactor|transcript|handle|result|session|definition|config|db|sessionId|id|turnId|url|token|input|ctx|state|context|event|socket|logger|exporter|sandbox|authorize|searchIndex|summarize|lookup|persist|render|myReducer|applyHostEvent|myProviderFor|myToolFor|myOtelWriter|myBackend|fs|github|docs|remote|servers|items|documents|doc|hits|shouldStop|shouldHandoff|done|sandboxAlive|userInput|saved|TurnView|ActionView|Markdown|Thinking|FileChip|SourceList|Divider|Spinner|Note|DocRef|Generic|Error|useState|useEffect|outcome|incoming|next|running|lead|researchBatch|batchResearch|webSearch|setName|custom|base|template|variant|usage|summary|fileResolver|myRegistry|controller|text|args|part|turn|turns|citation|annotation|applied|recent|newServer|other|mcpClient|tool|error|message|item|msg|entry|value|key|q|name|status|reason|delta|chunk|progress|index|file|image|city|topic|query|prompt|body|res|opts|params|payload|a|b|g|o|handleItem|incoming|session)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".vitepress" || name === ".snippet-check" || name === ".git" || name === "scripts") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".md") && !EXCLUDED_DOCS.has(name)) out.push(full);
  }
  return out;
}

function collect() {
  const blocks = [];
  for (const full of walk(ROOT).sort()) {
    const file = relative(ROOT, full);
    const lines = readFileSync(full, "utf8").split("\n");
    let i = 0;
    while (i < lines.length) {
      const open = /^```(typescript|ts)\s*$/.exec(lines[i]);
      if (!open) { i++; continue; }
      const start = i + 1;
      let j = start;
      while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
      blocks.push({ file, line: start + 1, lang: open[1], code: lines.slice(start, j).join("\n") });
      i = j + 1;
    }
  }
  return blocks;
}

const blocks = collect().filter((b) => !/^\s*\/\/\s*@check-skip\b/m.test(b.code));

// A page is one narrative: a block may use a type or helper that an earlier
// block on the same page declared. Collect every name each page declares so
// those references aren't reported as undefined.
const pageNames = new Map();
for (const b of blocks) {
  const names = pageNames.get(b.file) ?? new Set();
  for (const m of b.code.matchAll(
    /(?:^|\n)\s*(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) names.add(m[1]);
  pageNames.set(b.file, names);
}
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// Docs show imports once per page and omit them in later blocks, so a block
// without its own axle import gets one injected. A block that *does* import is
// left alone — that way a wrong import name is caught rather than papered over.
const AXLE_IMPORT = `import { Agent, Instruct, MCP, Transcript, ToolRegistry, PromptCompactor, TurnEventBuilder, Tracer, LogWriter, SimpleWriter, anthropic, openai, gemini, chatCompletions, generate, generateStep, stream, configureAxle, createAgentConfig, createAgentTool, parallelize, braveWebSearch, loadFileContent, estimateContextUsage, parseResponse, getCompactionStamp, validateCompactedMessages, createStats, addStats, mergeStats, AxleError, AxleAbortError, AxleAgentAbortError, AxleToolFatalError, InstructVariableError, AxleStopReason } from "@fifthrevision/axle";\n` +
  `import type { AIProvider, AgentConfig, AgentDefinition, AgentHandle, AgentSession, AgentResult, AxleMessage, AxleAssistantMessage, AxleUserMessage, AxleToolCallMessage, AxleFailure, Citation, CompactionCallback, CompactionConfig, ContentPart, ContextUsage, ExecutableTool, FileInfo, FileResolver, GenerateResult, MessageMetadata, ProviderTool, ShouldCompactOnTriggerCallback, Span, SpanData, Stats, StreamEvent, StreamResult, ToolContext, ToolDefinition, ToolResultPart, TraceWriter, Turn, TurnEvent, TurnPart, ActionPart, TextPart, ThinkingPart, Annotation, WebSearchBackend } from "@fifthrevision/axle";\n`;

const ZOD_IMPORT = `import * as z from "zod";\n`;

// Names the docs deliberately leave undefined, typed so the surrounding code
// still gets checked properly.
const AMBIENT = `
import type {
  Agent as A, AIProvider, Instruct as I, ExecutableTool, ProviderTool, MCP as M,
  Transcript as T, AxleMessage, AgentSession, AgentDefinition, Turn, TurnPart,
  TurnEvent, FileResolver, ToolRegistry as R, ToolContext, WebSearchBackend,
  PromptCompactor as P, TraceWriter,
} from "@fifthrevision/axle";

declare global {
  const provider: AIProvider;
  const model: string;
  const apiKey: string;
  const agent: A;
  const lead: A;
  const instruct: I<any>;
  const transcript: T;
  const myRegistry: R;
  const messages: AxleMessage[];
  const previousMessages: AxleMessage[];
  const newMessages: AxleMessage[];
  const definition: AgentDefinition;
  const turn: Turn;
  const ctx: ToolContext;
  const fileResolver: FileResolver;
  const tools: ExecutableTool[];
  const myTool: ExecutableTool;
  const getWeather: ExecutableTool;
  const searchTool: ExecutableTool;
  const webSearchTool: ExecutableTool;
  const myLocalTool: ExecutableTool;
  const myDatabaseTool: ExecutableTool;
  const research: ExecutableTool;
  const researcher: ExecutableTool;
  const showChart: ExecutableTool;
  const setName: ExecutableTool;
  const webSearch: ProviderTool;
  const fs: M;
  const github: M;
  const docs: M;
  const remote: M;
  const newServer: M;
  const other: M;
  const compactor: P;
  const myOtelWriter: TraceWriter;
  const myBackend: WebSearchBackend;
  const schema: any;
  const config: any;
  const db: any;
  const sandbox: any;
  const logger: any;
  const exporter: any;
  const socket: any;
  const url: string;
  const token: string;
  const sessionId: string;
  const turnId: string;
  const userInput: string;
  const items: any[];
  const documents: string[];
  const done: boolean;
  const shouldStop: boolean;
  const sandboxAlive: boolean;
  const events: TurnEvent[];\n  const id: string;\n  const event: TurnEvent;\n  const handle: import("@fifthrevision/axle").StreamHandle;
  const myOtel: TraceWriter;
  function authorize(id: string): Promise<void>;
  function searchIndex(q: string, o?: any): Promise<any[]>;
  function summarize(m: AxleMessage[]): Promise<string>;
  function lookup(p: any): Promise<any>;
  function render(t: readonly Turn[]): void;
  function myReducer(e: any): void;
  function myProviderFor(p: any): AIProvider;
  function myToolFor(r: any): ExecutableTool;
}
export {};
`;

const entries = blocks.map((b, index) => {
  const name = `s${String(index).padStart(3, "0")}.${b.lang === "tsx" ? "tsx" : "ts"}`;
  let preamble = "";
  if (!/from ["']@fifthrevision\/axle["']/.test(b.code)) preamble += AXLE_IMPORT;
  if (/\bz\./.test(b.code) && !/from ["']zod["']/.test(b.code)) preamble += ZOD_IMPORT;
  const offset = preamble ? preamble.split("\n").length - 1 : 0;
  writeFileSync(join(WORK, name), `${preamble}${b.code}\nexport {};\n`);
  return { ...b, name, index, offset };
});

const tsconfig = {
  compilerOptions: {
    target: "es2022",
    module: "esnext",
    moduleResolution: "bundler",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    jsx: "react-jsx",
    types: ["node"],
    lib: ["es2023", "dom"],
  },
};

// tsc stops before the checker when any file fails to parse, so this runs twice:
// once to identify the fragments, then again with them excluded so the
// remaining blocks actually get type-checked.
function tsc(include) {
  writeFileSync(join(WORK, "_ambient.d.ts"), AMBIENT);
  writeFileSync(join(WORK, "tsconfig.json"), JSON.stringify({ ...tsconfig, include: [...include, "_ambient.d.ts"] }, null, 2));
  const run = spawnSync(
    join(ROOT, "node_modules/.bin/tsc"),
    ["-p", WORK, "--pretty", "false"],
    { encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024 },
  );
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  if (run.error) {
    console.error("tsc failed to run:", run.error.message);
    process.exit(2);
  }
  // A bad tsconfig makes tsc skip checking entirely and report nothing useful,
  // which reads as a clean run. Fail loudly instead.
  if (/error TS5\d{3}/.test(out)) {
    console.error("tsconfig rejected by tsc:\n" + out);
    process.exit(2);
  }
  return out;
}

const DIAGNOSTIC = /(?:^|[/\\])(s\d+\.tsx?)\((\d+),(\d+)\): error TS(\d+): (.*)$/;

// Every identifier the package declares, exported or not. Reference pages quote
// internal type names when documenting a shape; that is intentional.
const DECLARED = new Set(
  readdirSync(join(ROOT, "node_modules/@fifthrevision/axle/dist"))
    .filter((f) => f.endsWith(".d.ts"))
    .flatMap((f) => [
      ...readFileSync(join(ROOT, "node_modules/@fifthrevision/axle/dist", f), "utf8")
        .matchAll(/(?:declare\s+)?(?:interface|type|class|enum)\s+([A-Za-z_$][\w$]*)/g),
    ].map((m) => m[1])),
);

const AMBIENT_NAMES = new Set(
  [...AMBIENT.matchAll(/^\s*(?:const|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
);

// Names the package exports. A block that elides its import (because the page
// showed it earlier) or re-declares a type to document its shape is doing so on
// purpose, so neither is an error.
const EXPORTED = new Set(
  [...readFileSync(join(ROOT, "node_modules/@fifthrevision/axle/dist/index.d.ts"), "utf8")
    .matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap((m) => m[1].split(","))
    .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop())
    .filter(Boolean),
);

const firstPass = tsc(["*.ts", "*.tsx"]);
const fragmentNames = new Set();
for (const line of firstPass.split("\n")) {
  const m = DIAGNOSTIC.exec(line.trim());
  if (m && Number(m[4]) >= 1000 && Number(m[4]) < 2000) fragmentNames.add(m[1]);
}

const checkable = entries.filter((e) => !fragmentNames.has(e.name)).map((e) => e.name);
const raw = checkable.length > 0 ? tsc(checkable) : "";

const byName = new Map(entries.map((e) => [e.name, e]));
const fragments = fragmentNames;
const errors = [];

for (const line of raw.split("\n")) {
  const m = DIAGNOSTIC.exec(line.trim());
  if (!m) continue;
  const [, name, lineNo, , code, message] = m;
  const entry = byName.get(name);
  if (!entry) continue;
  const num = Number(code);
  if (num >= 1000 && num < 2000) continue;

  const missing = /Cannot find name '([^']+)'/.exec(message)?.[1];
  if (
    missing &&
    (PLACEHOLDER.test(missing) ||
      EXPORTED.has(missing) ||
      DECLARED.has(missing) ||
      pageNames.get(entry.file)?.has(missing))
  ) continue;
  const conflict = /(?:Duplicate identifier|Import declaration conflicts with local declaration of) '([^']+)'/.exec(message)?.[1];
  if (conflict && EXPORTED.has(conflict)) continue;
  const redeclared = /Cannot redeclare block-scoped variable '([^']+)'/.exec(message)?.[1];
  if (redeclared && EXPORTED.has(redeclared)) continue;
  const tdz = /(?:Block-scoped variable|Variable) '([^']+)' (?:is )?used before (?:its declaration|being assigned)/.exec(message)?.[1];
  if (tdz && AMBIENT_NAMES.has(tdz)) continue;
  const circular = /'([^']+)' implicitly has type 'any' because it does not have a type annotation/.exec(message)?.[1];
  if (circular && AMBIENT_NAMES.has(circular)) continue;
  // Reference pages document shapes by declaring classes with bare signatures.
  if (num === 2390 || num === 2391 || num === 2420 || num === 2564) continue;
  if (num === 7006 || num === 7031) continue;
  const missingModule = /Cannot find module '([^']+)'/.exec(message)?.[1];
  if (missingModule && !missingModule.startsWith("@fifthrevision")) continue;
  if (num === 7016 || num === 7026) continue;

  errors.push({
    file: entry.file,
    docLine: entry.line + Number(lineNo) - 1 - entry.offset,
    code: num,
    message,
    source: entry.code.split("\n")[Number(lineNo) - 1 - entry.offset]?.trim() ?? "",
  });
}

console.log(`snippets:  ${entries.length}`);
console.log(`fragments: ${fragments.size} (syntactic — skipped)`);
console.log(`errors:    ${errors.length} across ${new Set(errors.map((e) => e.file)).size} files\n`);

for (const e of errors) {
  console.log(`${e.file}:${e.docLine}  TS${e.code}  ${e.message}`);
  if (e.source) console.log(`    > ${e.source}`);
}

if (process.env.SHOW_FRAGMENTS) {
  console.log("\n--- fragment blocks (skipped) ---");
  for (const name of [...fragments].sort()) {
    const e = byName.get(name);
    console.log(`${e.file}:${e.line}`);
  }
}

process.exitCode = errors.length > 0 ? 1 : 0;
