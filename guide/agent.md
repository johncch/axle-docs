---
title: Agent
description: The primary interface for building multi-turn agents.
---

# Agent

`Agent` is the primary interface. It owns the provider, model, system prompt,
tools, and conversation history. `send()` is the only verb — it accepts either
a plain string or an [`Instruct`](/guide/instruct).

```typescript
import { Agent, anthropic, calculatorTool } from "@fifthrevision/axle";

const agent = new Agent({
  provider: anthropic(apiKey),
  model: "claude-sonnet-4-5-20250929",
  system: "You are a helpful assistant.",
  tools: [calculatorTool],
});
```

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

## Multi-turn conversations

The agent maintains its own history. Each `send()` is appended to that
history, so subsequent calls share the prior context automatically.

```typescript
await agent.send("Hi, my name is Ana.").final;
await agent.send("What's my name?").final;
// → "Your name is Ana."
```

## Model request options

`Agent` accepts normalized model request options at construction time. These
become the defaults for every `send()` call.

```typescript
const agent = new Agent({
  provider,
  model,
  maxOutputTokens: 500,
  temperature: 0.7,
  topP: 0.9,
  stop: ["END"],
  reasoning: true,
});
```

### Per-turn overrides

Options passed to `send()` override the agent defaults for that turn only.

```typescript
await agent.send("Summarize this", { temperature: 0 });
```

### Provider-specific options

Use `providerOptions` for raw provider-specific fields not covered by the
normalized surface. At the agent level these are defaults; `providerOptions`
passed to `send()` are **shallow-merged** with those defaults.

```typescript
const agent = new Agent({
  provider,
  model,
  providerOptions: { seed: 42 },
});

// This turn gets { seed: 42, metadata: { source: "send" } }
await agent.send("Go", {
  providerOptions: { metadata: { source: "send" } },
});
```

### Tool choice

Control how the model uses tools for a specific turn:

```typescript
await agent.send("Search the web", {
  toolChoice: { type: "tool", name: "web_search" },
  parallelToolCalls: false,
});
```

Supported values for `toolChoice`:

```typescript
type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "tool"; name: string };
```

## Context counter

`agent.context()` returns an estimate of how many tokens the current system
prompt, messages, and tools occupy in the context window.

```typescript
const usage = agent.context();
console.log(usage.total);    // estimated total tokens
console.log(usage.messages); // tokens in conversation history
console.log(usage.tools);    // tokens for tool definitions
```

The returned `ContextUsage` object has `total`, `system`, `tools`, `mcpTools`,
`providerTools`, and `messages` fields. When a `limit` is provided it also
includes `free`.

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

## Streaming events

`agent.on(...)` registers a callback that fires for every subsequent `send()`.
See [Streaming](/guide/streaming) for the full event list.
