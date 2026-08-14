---
title: Tools
description: Four ways to give an agent capabilities — local tools, provider tools, MCP, and subagents.
---

# Tools

Axle has one tool registry and four ways to fill it.

| Kind | Runs where | What you supply |
| --- | --- | --- |
| **Executable tool** | Your process | Name, description, Zod schema, `execute` |
| **Provider tool** | The provider's infrastructure | A name and optional config |
| **MCP tool** | An MCP server | A client config — Axle discovers the tools |
| **Subagent** | Your process, as a nested `Agent` | A child agent factory |

They all land in the same `ToolRegistry`, and the model sees one flat list. Which
means names have to be unique across all four — duplicates throw as soon as you
register them, rather than confusing the model later.

## Executable tools

A tool is a plain object. No base class, no decorator.

```typescript
import type { ExecutableTool } from "@fifthrevision/axle";
import * as z from "zod";

const getWeather: ExecutableTool = {
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({ city: z.string().describe("City name, e.g. Lisbon") }),
  async execute({ city }, ctx) {
    const res = await fetch(`https://api.example.com/weather?q=${city}`, {
      signal: ctx.signal,
    });
    return JSON.stringify(await res.json());
  },
};

const agent = new Agent({ provider, model, tools: [getWeather] });
```

::: tip Get typed input in `execute`
Declare the schema separately and pass its type:
`const tool: ExecutableTool<typeof schema> = { schema, … }`. With a bare
`ExecutableTool` annotation it still compiles, but your `input` properties come
through as `unknown`.
:::

Here's the thing worth internalizing: **the description and the schema are the
prompt for this tool.** That's where the model decides whether to call it and
what to pass. Time spent on a clear description and a `.describe()` on each
non-obvious field pays back more than almost anything else you can do.

Axle ships no concrete local tools — no filesystem, no shell. That's on purpose:
what your application should expose is your call, not the library's.

## The tool context

`execute` gets a `ToolContext` as its second argument:

```typescript
async execute(input, ctx) {
  ctx.signal;              // AbortSignal — please forward it to your I/O
  ctx.emit("Fetching…");   // stream progress to the UI
  ctx.reportUsage(usage);  // roll a nested model call's tokens into the parent
  ctx.registry;            // the live registry
  ctx.span;                // tracing span for this call
}
```

`ctx.emit` is what makes a slow tool feel alive — whatever you pass shows up as
`action:progress` events while `execute` is still running. Without it, a
ten-second tool just looks frozen to your user.

## Returning more than text

`execute` can return a string, or an array of parts including files:

```typescript
async execute() {
  const image = await loadFileContent("./chart.png", "base64");
  return [
    { type: "text", text: "Chart attached." },
    { type: "file", file: image },
  ];
}
```

[Files, images & PDFs](/cookbook/files-and-images) covers URL and
deferred-reference sources.

## When a tool fails

An ordinary throw inside `execute` becomes a tool error result that goes back to
the model, which usually retries or works around it. The run keeps going. That's
almost always what you want.

If you need to kill the run instead, throw `AxleToolFatalError` — that propagates
out of `send()` rather than resolving as a result. Save it for cases where
carrying on would be incoherent, like the sandbox your tool operates on no longer
existing. See [Results & errors](/concepts/results-and-errors).

## Provider tools

Provider-managed tools run on the provider's infrastructure — hosted web search,
code execution. You name them; you don't implement them.

```typescript
import type { ProviderTool } from "@fifthrevision/axle";

const webSearch: ProviderTool = { type: "provider", name: "web_search" };
const agent = new Agent({ provider, model, providerTools: [webSearch] });
```

Axle translates the portable names `web_search` and `code_execution` into each
vendor's own name:

| Portable name | Anthropic | OpenAI | Gemini |
| --- | --- | --- | --- |
| `web_search` | `web_search_20250305` | `web_search_preview` | `googleSearch` |
| `code_execution` | — | `code_interpreter` | `codeExecution` |

Any other name passes through untouched, so vendor-specific tools work by naming
them directly. The optional `config` object is raw passthrough — field names and
placement differ per vendor, so anything you put there is not portable.

Results come back as `provider-tool` action parts and, for search, as
[citations](/reference/messages). See [Provider tools](/cookbook/provider-tools).

### If a provider has no native search

Ask for `web_search` on a provider that doesn't have one and Axle throws — unless
you've registered a fallback backend, in which case it quietly substitutes a real
executable tool.

```typescript
import { configureAxle, braveWebSearch } from "@fifthrevision/axle";

configureAxle({ webSearchFallback: braveWebSearch({ apiKey }) });
```

Now the same agent code works against Ollama as against Anthropic. See
[Web search](/cookbook/web-search).

## MCP servers

An `MCP` client connects to a server and brings its tools along.

```typescript
import { MCP } from "@fifthrevision/axle";

const fs = new MCP({
  transport: "stdio",
  name: "fs",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
});

await fs.connect();
const agent = new Agent({ provider, model, mcps: [fs] });
```

Both `stdio` and streamable `http` transports work.

Tool discovery is **lazy** — the agent calls `listTools()` on the first send that
needs it, once per client, and caches the result. But you do have to `connect()`
yourself first; the agent won't do it for you, and an unconnected client throws
on that first send. It's the single most common stumble here.

The client's `name` becomes a prefix on every tool it contributes, which is how
two servers can both offer a `read_file` without colliding.

Call `refreshTools()` if a server's tool list changes while running, and
`close()` when you're done.

## Subagents

`createAgentTool` turns a whole `Agent` into a tool, so a parent model can hand
off bounded work and get back only the final answer.

```typescript
import { createAgentTool } from "@fifthrevision/axle";

const research = createAgentTool({
  name: "research",
  description: "Research a topic in depth and report findings",
  schema: z.object({ topic: z.string() }),
  createAgent: () => new Agent({ provider, model, tools: [webSearchTool] }),
  prompt: (input) => `Research ${input.topic}. Report the three key findings.`,
});
```

The child's turn events get forwarded through `ctx.emit`, so your UI can render
the nested run live as a `SubagentAction` with its own `children` turns. Its
token usage flows through `ctx.reportUsage` and rolls into the parent's totals.

Do create a **fresh** child agent per call. A shared one accumulates history
across unrelated invocations, which gets strange quickly.

## Running a tool over many inputs

`parallelize` wraps any tool in a batch version that takes an array and runs the
inner tool concurrently.

```typescript
import { parallelize } from "@fifthrevision/axle";

const researchBatch = parallelize(research, { maxConcurrency: 4, maxItems: 20 });
```

Results keep their input order. Ordinary per-item failures get reported per item
instead of failing the batch, while fatal and abort errors still terminate the
run — same contract as the unbatched tool.

## Where they all end up

All four kinds land in the same [`ToolRegistry`](/concepts/tool-registry) —
one flat namespace the model sees as a single list.

```typescript
agent.registry.size; // everything, across all four sources
```

Worth reading that page rather than treating the registry as plumbing. It exists
so the tool set can **change while the agent runs** — a tool that loads more
tools, capabilities unlocked as a conversation narrows, permissions decided
per-user. Not a constructor argument you set once.

## Next

- [The tool registry](/concepts/tool-registry) — where they live, and changing them at runtime
- [generate() & stream()](/concepts/generate-and-stream) — the tool loop without an Agent
- [Tools reference](/reference/tools)
- [Tool-using agent](/cookbook/tool-using-agent)
