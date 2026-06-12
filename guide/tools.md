---
title: Tools
description: Give the agent functions it can call.
---

# Tools

A tool is an object with a name, description, Zod schema, and an `execute`
function. Pass tools to the `Agent` constructor.

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";
import { z } from "zod";

const weatherTool = {
  name: "getWeather",
  description: "Get current weather for a city",
  schema: z.object({ city: z.string() }),
  async execute(input) {
    return JSON.stringify({ temp: 72, condition: "sunny" });
  },
};

const agent = new Agent({
  provider: anthropic(apiKey),
  model: "claude-sonnet-4-5-20250929",
  tools: [weatherTool],
});
```

Axle drives the tool-call loop automatically — the agent will call your tool,
feed the result back to the model, and continue until the model produces a
final response.

## Defining tools

Define tools directly in your application code. The `ExecutableTool` type
describes the interface:

```typescript
import type { ExecutableTool } from "@fifthrevision/axle";
import { z } from "zod";

const myTool: ExecutableTool = {
  name: "lookup",
  description: "Look up information by key",
  schema: z.object({ key: z.string() }),
  async execute(input, ctx) {
    // input is fully typed from the Zod schema
    // ctx provides signal, emit, registry, span, and reportUsage
    return "result";
  },
};
```

The `ctx` parameter gives access to:
- `ctx.signal` — `AbortSignal` for cancellation
- `ctx.emit(chunk)` — stream progress chunks (surfaces as `action:progress` events)
- `ctx.registry` — the live tool registry (for dynamic tool loading)
- `ctx.span` — observability span for this tool execution
- `ctx.reportUsage(usage)` — report token usage (surfaces in `result.usage.breakdown`)

## File results and deferred references

Tools can return mixed text and file parts. Instead of inlining file bytes, a
tool can return a deferred `{ type: "ref" }` source that Axle resolves via
`fileResolver` at each provider conversion:

```typescript
import type { ExecutableTool, FileResolver } from "@fifthrevision/axle";
import { z } from "zod";

const readFile: ExecutableTool = {
  name: "read_file",
  description: "Read a file from the sandbox",
  schema: z.object({ id: z.string() }),
  async execute({ id }) {
    return [
      {
        type: "file",
        file: {
          kind: "text",
          mimeType: "text/plain",
          name: "result.txt",
          source: { type: "ref", ref: { id } },
        },
      },
    ];
  },
};

const agent = new Agent({
  provider,
  model,
  tools: [readFile],
  fileResolver: async ({ ref, accepted }) => {
    // Authorize the opaque host ref and return one of the requested formats.
    return { type: "text", content: await sandbox.readText((ref as { id: string }).id) };
  },
});
```

Deferred refs stay in message history and session snapshots; Axle resolves them
again on every provider conversion. This avoids persisting expiring signed URLs.

Providers support deferred tool-result files as follows:
- Anthropic, OpenAI Responses, and Gemini: image, PDF, and text
- Chat Completions: text only

## Subagent tools

::: warning Experimental
`createAgentTool` is usable today, but event and part shapes may change in a
minor release while the feature is validated in real applications.
:::

`createAgentTool` exposes a child Agent as a normal tool, letting a parent
model delegate bounded work and receive only the child's final response.

```typescript
import { Agent, createAgentTool } from "@fifthrevision/axle";
import { z } from "zod";

const researcher = createAgentTool({
  name: "research",
  description: "Delegate a research question to a focused subagent",
  schema: z.object({ question: z.string() }),
  createAgent: () =>
    new Agent({
      provider,
      model: "claude-haiku-4-5-20251001",
      system: "You are a focused researcher. Answer concisely.",
    }),
  prompt: (input) => input.question,
});

const agent = new Agent({ provider, model, tools: [researcher] });
```

The child's turn events are forwarded through the parent (`action:child-event`),
and its token usage is reported into the parent's totals with per-model
attribution in `result.usage.breakdown`. `createAgent` runs once per tool
invocation.

## Parallelizing tools

::: warning Experimental
The generated tool's result shape (`ParallelToolResult`) may change in a minor
release.
:::

`parallelize` wraps a tool in a batch variant that runs many inputs
concurrently in a single tool call:

```typescript
import { parallelize } from "@fifthrevision/axle";

const batchResearch = parallelize(researcher, { maxConcurrency: 4 });
// → tool "research_batch" accepting { items: [{ question }, ...] }

const agent = new Agent({ provider, model, tools: [batchResearch] });
```

The generated tool preserves input order and reports per-item failures instead
of failing the whole batch. Options: `name`, `description`, `maxItems`
(default 50), `maxConcurrency` (default 8).

## CLI built-in tools

When using the CLI (`@fifthrevision/axle-cli`), the following tool names can
be declared in job files and are resolved automatically:

- `calculator` — basic math
- `exec` — run shell commands
- `patch-file` — apply a patch to an existing file
- `read-file` — read a file from disk
- `write-file` — write a file to disk

These tools are not exported from the `@fifthrevision/axle` library package.
Define equivalent tools in your application code if you need them outside the
CLI.

## Tool failures

Tool errors come back as a normal `result.error.kind === "tool"` failure that
the model can react to. To stop execution immediately and surface the failure
to your application, throw `AxleToolFatalError` from `execute`. Fatal tool
errors preserve available partial output, messages, usage, and tool context.

A tool that throws an error merely named `AbortError` (e.g. an internal
`fetch` timeout) while the run's signal is live is now reported to the model
as an ordinary tool error. The model can retry or continue. To genuinely
abort the run, throw `AxleAbortError` or `AxleToolFatalError` explicitly.

## Abort signals

Tool `execute` receives an `AbortSignal` via `ctx.signal` as part of
`ToolContext`. Long-running tools should respect it so `handle.cancel()`
propagates correctly through to external processes, MCP servers, and HTTP
requests.