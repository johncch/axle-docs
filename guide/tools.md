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
    // ctx provides signal, emit, registry, and span
    return "result";
  },
};
```

The `ctx` parameter gives access to:
- `ctx.signal` — `AbortSignal` for cancellation
- `ctx.emit(chunk)` — stream progress chunks (surfaces as `action:progress` events)
- `ctx.registry` — the live tool registry (for dynamic tool loading)
- `ctx.span` — observability span for this tool execution

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

## Abort signals

Tool `execute` receives an `AbortSignal` via `ctx.signal` as part of
`ToolContext`. Long-running tools should respect it so `handle.cancel()`
propagates correctly through to external processes, MCP servers, and HTTP
requests.
