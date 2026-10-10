---
title: Tools
description: Tool types, the registry, subagents, batching, and web search.
---

# Tools

Conceptual guide: [Tools](/concepts/tools).

## ExecutableTool

```typescript
import type { ZodObject, z } from "zod";

interface ExecutableTool<TSchema extends ZodObject<any> = ZodObject<any>> {
  type?: "function";
  kind?: "tool" | "agent";
  name: string;
  description: string;
  schema: TSchema;
  execute(input: z.infer<TSchema>, ctx: ToolContext): Promise<string | ToolResultPart[]>;
  configure?(config: Record<string, any>): void;
  summarize?(input: z.infer<TSchema>): string;
}
```

| Field | Notes |
| --- | --- |
| `name` | Must be unique across local, MCP, and provider tools. |
| `description` | Sent to the model. This is prompt text. |
| `schema` | Must be a Zod **object**. Use `.describe()` on fields. |
| `kind` | Presentation only. `"agent"` renders as a subagent; execution is identical. |
| `summarize` | Optional human-readable one-liner for a UI. |
| `configure` | Optional hook for host-supplied configuration. |

## ToolContext

```typescript
interface ToolContext {
  signal: AbortSignal;
  emit: (chunk: ToolProgressChunk) => void;
  reportUsage?: (usage: Stats) => void; // @experimental
  span?: Span;
}

type ToolProgressChunk = string | { type: "turn-event"; event: TurnEvent };
```

`emit` with a string surfaces as `action:progress`. Emitting a wrapped
`TurnEvent` is how nested agents forward their own event stream — it becomes
`action:child-event`.

(`registry` was removed from `ToolContext` in 0.34.0. A tool that changes the
agent it runs under uses that agent in closure scope — `agent.registry.add(...)`,
`agent.skills.add(...)`. See [Upgrading](/upgrading).)

## ToolResultPart

```typescript
type ToolResultPart =
  | { type: "text"; text: string }
  | { type: "file"; file: FileInfo };
```

## ProviderTool

```typescript
interface ProviderTool {
  type: "provider";
  name: string;
  config?: Record<string, unknown>;
}
```

Portable names and their native mappings:

| Portable | Anthropic | OpenAI | Gemini |
| --- | --- | --- | --- |
| `web_search` | `web_search_20260318` | `web_search` | `googleSearch` |
| `code_execution` | `code_execution_20260521` | `code_interpreter` | `codeExecution` |

Unmapped names pass through unchanged. `config` is raw passthrough — field names
and placement are not portable. On Anthropic, `web_search` defaults to
`allowed_callers: ["direct"]`; see [Provider tools](/cookbook/provider-tools).

## ToolDefinition

```typescript
type ToolDefinition = Pick<ExecutableTool, "name" | "description" | "schema">;
```

The schema-only shape sent to providers.

## ToolRegistry

Conceptual guide: [The tool registry](/concepts/tool-registry).

```typescript
new ToolRegistry(init?: { tools?: ExecutableTool[]; providerTools?: ProviderTool[] })
```

| Method | Returns | Notes |
| --- | --- | --- |
| `add(tool \| tools)` | `void` | Local tools. Throws `TOOL_REGISTRY_DUPLICATE` on a name collision. |
| `addMcp(tool \| tools)` | `void` | MCP tools. Same duplicate check. |
| `addProvider(tool \| tools)` | `void` | Provider tools. Same duplicate check. |
| `remove(name)` | `boolean` | Removes from all three maps. |
| `has(name)` | `boolean` | Across all three. |
| `get(name)` | `ExecutableTool \| undefined` | Local, then MCP. Not provider tools. |
| `getProvider(name)` | `ProviderTool \| undefined` | |
| `executable()` | `ExecutableTool[]` | Local + MCP. |
| `local()` | `ExecutableTool[]` | |
| `mcp()` | `ExecutableTool[]` | |
| `provider()` | `ProviderTool[]` | |
| `size` | `number` | Total across all three. |

Names are unique across all three maps — a local tool and a provider tool cannot
share a name.

## createAgentTool()

```typescript
createAgentTool<TSchema>(options: CreateAgentToolOptions<TSchema>): ExecutableTool<TSchema>
```

```typescript
interface CreateAgentToolOptions<TSchema> {
  name: string;
  description: string;
  schema: TSchema;
  createAgent: (input: z.infer<TSchema>, ctx: ToolContext) => MaybePromise<Agent>;
  prompt?: string | ((input: z.infer<TSchema>) => string);
  request?: AxleModelRequestOptions;
}
```

::: warning Experimental
Subagent rendering shapes may change in a minor release.
:::

Behavior:

- Returns a tool with `kind: "agent"`.
- `createAgent` runs per call. Return a **fresh** agent.
- `prompt` defaults to `` `Complete this delegated task. Input: ${JSON.stringify(input)}` ``.
- Child turn events are forwarded via `ctx.emit`; the subscription is removed when
  the call ends.
- Child usage is reported via `ctx.reportUsage`.
- A non-`ok` child result throws `Error("Subagent failed: …")`.
- A non-string child response is `JSON.stringify`'d.
- `AxleToolFatalError` and `AxleAbortError` from the child are rebuilt without
  the child's `messages`/`partial`, so the parent never adopts another
  conversation's history. `usage` is preserved.
- `ctx.signal` is forwarded to the child send.

## parallelize()

```typescript
parallelize<TSchema>(
  tool: ExecutableTool<TSchema>,
  options?: ParallelizeOptions,
): ExecutableTool<ZodObject<{ items: z.ZodArray<TSchema> }>>
```

```typescript
interface ParallelizeOptions {
  name?: string; // default `${tool.name}_batch`
  description?: string;
  maxItems?: number; // default 50
  maxConcurrency?: number; // default 8, floor 1
  maxResultBytes?: number; // default 20 MiB
}

interface ParallelToolResult<TInput = unknown> {
  index: number;
  input: TInput;
  ok: boolean;
  output?: string | ToolResultPart[];
  error?: { type: "execution"; message: string };
}
```

::: warning Experimental
The generated tool's result parts may change in a minor release.
:::

Results preserve input order. Ordinary execution errors are reported per item;
fatal and abort errors propagate and terminate the run. The generated schema
requires at least one item and at most `maxItems`. The wrapped tool's `kind` is
inherited, so batched subagents still render as subagent activity.

## Web search

```typescript
braveWebSearch(options: BraveWebSearchOptions): ExecutableTool
```

An executable tool named `web_search` — pass it as `webSearch` to the
`chatCompletions()` provider that needs it, and request `web_search` as a
provider tool as usual. (It used to return a backend registered with
`configureAxle`; both are gone in 0.34.0. See [Upgrading](/upgrading).)

```typescript
import { chatCompletions, braveWebSearch } from "@fifthrevision/axle";

const provider = chatCompletions("https://api.together.ai/v1", {
  apiKey,
  webSearch: braveWebSearch({ apiKey: braveKey }),
});
```

```typescript
interface BraveWebSearchOptions {
  apiKey: string; // required and non-empty
  endpoint?: string; // default https://api.search.brave.com/res/v1/llm/context
  maxResults?: number; // default 5, range 1–50
  candidateCount?: number;
  maxTokens?: number;
  maxSnippets?: number;
  maxTokensPerUrl?: number;
  maxSnippetsPerUrl?: number;
  contextThresholdMode?: string;
  country?: string;
  searchLanguage?: string;
  freshness?: "pd" | "pw" | "pm" | "py" | `${string}to${string}`;
  timeoutMs?: number;
}
```

```typescript
interface WebSearchResult {
  title: string;
  url: string;
  snippets: string[];
}
```

Register it on the provider (above), not with
[`configureAxle`](/reference/configuration) — the global fallback was removed in
0.34.0.

### Custom search tools

Any search API works — write an `ExecutableTool` named `web_search` whose
`execute` returns the results as a string, and pass it as `webSearch`:

```typescript
import { chatCompletions, type ExecutableTool } from "@fifthrevision/axle";
import * as z from "zod";

declare const searchIndex: (query: string, signal: AbortSignal) => Promise<{ title: string; url: string; passages: string[] }[]>;

const internalSearchSchema = z.object({ query: z.string().trim().min(1).max(400) });

const internalSearch: ExecutableTool<typeof internalSearchSchema> = {
  name: "web_search",
  description: "Search the internal docs index for current information.",
  schema: internalSearchSchema,
  async execute({ query }, { signal }) {
    const hits = await searchIndex(query, signal);
    return JSON.stringify({
      query,
      results: hits.map((h) => ({ title: h.title, url: h.url, snippets: h.passages })),
    });
  },
};

const provider = chatCompletions("http://localhost:11434/v1", {
  webSearch: internalSearch,
});
```

This is also how you point `web_search` at an internal corpus rather than the
public web. Your agent code doesn't change at all — only what "search" means.

Do forward `signal`, so a cancelled send doesn't leave a search running.

The generated tool takes `{ query: string }` (trimmed, 1–400 characters). The
Brave tool returns JSON `{ query, results }` where each result is `{ title, url,
snippets }`.
