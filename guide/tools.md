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

## Built-in tools

Axle includes several ready-to-use tools:

- `braveSearchTool` — web search via Brave
- `calculatorTool` — basic math
- `execTool` — run shell commands
- `readFileTool` — read a file from disk
- `writeFileTool` — write a file to disk
- `patchFileTool` — apply a patch to an existing file

```typescript
import { Agent, calculatorTool, readFileTool } from "@fifthrevision/axle";

const agent = new Agent({
  provider,
  model,
  tools: [calculatorTool, readFileTool],
});
```

## Tool failures

Tool errors come back as a normal `result.error.kind === "tool"` failure that
the model can react to. To stop execution immediately and surface the failure
to your application, throw `AxleToolFatalError` from `execute`. Fatal tool
errors preserve available partial output, messages, usage, and tool context.

## Abort signals

Tool `execute` receives an `AbortSignal` as its second argument. Long-running
tools should respect it so `handle.cancel()` propagates correctly through to
external processes, MCP servers, and HTTP requests.
