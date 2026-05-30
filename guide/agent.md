---
title: Agent
description: The primary interface for building multi-turn agents.
---

# Agent

`Agent` is the primary interface. It owns the provider, model, system prompt,
tools, and conversation history. `send()` is the only verb — it accepts either
a plain string or an [`Instruct`](/guide/instruct).

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";
import type { ExecutableTool } from "@fifthrevision/axle";
import { z } from "zod";

const myTool: ExecutableTool = {
  name: "lookup",
  description: "Look up a value",
  schema: z.object({ key: z.string() }),
  async execute(input) { return "result"; },
};

const agent = new Agent({
  provider: anthropic(apiKey),
  model: "claude-sonnet-4-5-20250929",
  system: "You are a helpful assistant.",
  tools: [myTool],
});
```

## Request options

`Agent` accepts normalized model request options as constructor defaults. These
apply to every `send()` unless overridden per-turn.

```typescript
const agent = new Agent({
  provider,
  model,
  reasoning: true,
  maxOutputTokens: 1000,
  temperature: 0.7,
  topP: 0.9,
  stop: ["END"],
});
```

Use `providerOptions` for raw provider-specific fields that are not covered by
the normalized surface:

```typescript
const agent = new Agent({
  provider,
  model,
  providerOptions: { seed: 42 },
});
```

See [Low-level APIs](/guide/low-level) for the full list of normalized options.

## `send()`

```typescript
const handle = agent.send("Write me a poem.");

const result = await handle.final;
if (!result.ok) throw new Error(result.error.kind);
console.log(result.response);
```

- For string inputs, `result.response` is the assistant's text.
- For `Instruct` inputs with a schema, `result.response` is the parsed object.
- See [Results & Errors](/guide/results) for details on the result shape.

### Per-turn overrides

Pass any normalized request option to `send()` to override the agent's defaults
for that turn only:

```typescript
await agent.send("Summarize this", { temperature: 0 });
await agent.send("Be creative", { temperature: 1.2, maxOutputTokens: 2000 });
```

`providerOptions` are shallow-merged with the agent's defaults:

```typescript
const agent = new Agent({
  provider,
  model,
  providerOptions: { seed: 1 },
});

// The request receives: { seed: 1, metadata: { source: "send" } }
await agent.send("Go", {
  providerOptions: { metadata: { source: "send" } },
});
```

### User-turn metadata

Pass `metadata` to `send()` to attach stable host-owned data to the user
message. Providers ignore it; Axle stores it in history and copies it onto the
corresponding user `Turn`.

```typescript
await agent.send("Rewrite this prompt", {
  metadata: { surface: "prompt-editor", requestId: "abc123" },
});
```

Use metadata for stable facts about the message. Use annotations for mutable,
async, or explicitly placed UI state.

## Multi-turn conversations

The agent maintains its own history. Each `send()` is appended to that
history, so subsequent calls share the prior context automatically.

```typescript
await agent.send("Hi, my name is Ana.").final;
await agent.send("What's my name?").final;
// → "Your name is Ana."
```

## Cancellation

`send()` returns a handle. Call `handle.cancel(reason)` to abort mid-stream.
`handle.final` then rejects with an `AbortError` that preserves `reason`,
`usage`, `turn`, and any partial output.

```typescript
const handle = agent.send("Long task...");
setTimeout(() => handle.cancel("user-cancelled"), 5000);

try {
  const result = await handle.final;
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    // handle cancellation
  } else {
    throw err;
  }
}
```

## Context counter

`agent.context()` returns an estimate of the current context window usage,
broken down by system prompt, messages, tools, MCP tools, and provider tools:

```typescript
const ctx = agent.context();
console.log(`Using ~${ctx.total} tokens (${ctx.free} free)`);
// { total, system, messages, tools, mcpTools, providerTools, limit?, free? }
```

## Streaming events

`agent.on(...)` registers a callback that fires for every subsequent `send()`.
See [Streaming](/guide/streaming) for the full event list.

## Session snapshot and restore

`Agent` supports serializable session state for save/resume workflows.

### Saving a session

```typescript
const saved: SavedAgent = {
  definition: myAgentDefinition, // AgentDefinition (serializable recipe)
  session: agent.snapshot(),     // AgentSession (messages, turns, sessionId)
};
```

### Restoring a session

You can restore a session either by passing it to the constructor (preferred)
or by calling `restore()` after construction:

```typescript
// Constructor form (0.21.0+) — shorter, equivalent to the two-step form below
const config = await createAgentConfig(saved.definition, resolver);
const restoredAgent = new Agent(config, saved.session);
```

```typescript
// Two-step form — still supported
const config = await createAgentConfig(saved.definition, resolver);
const restoredAgent = new Agent(config);
restoredAgent.restore(saved.session);
```

If both `config.sessionId` and `session.sessionId` are supplied, the restored
session id wins.

`AgentDefinition` is a serializable recipe — it describes the provider, model,
tools, and request defaults in a form that can be stored in a database or sent
over the wire. Hosts resolve it into a runtime `AgentConfig` using
`createAgentConfig(definition, resolver)`.

`AgentSession` holds continuation state: the model-facing message history,
renderable turns, session annotations, and the stable `sessionId`.

See [Hosting & Sessions](/guide/hosting) for the full pattern.
