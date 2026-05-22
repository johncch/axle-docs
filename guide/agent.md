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

Pass model request options to the `Agent` constructor to apply them as
defaults for every `send()`. Options passed directly to `send()` override the
agent-level defaults for that turn.

```typescript
const agent = new Agent({
  provider,
  model,
  maxOutputTokens: 1024,
  temperature: 0.7,
  reasoning: true,
});

// Override temperature for a single turn
await agent.send("Summarize this briefly.", { temperature: 0 }).final;
```

The full set of normalized options:

| Option               | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `reasoning`          | Enable or disable provider reasoning/thinking.                 |
| `maxOutputTokens`    | Maximum number of output tokens to request.                    |
| `temperature`        | Sampling temperature (provider-dependent).                     |
| `topP`               | Nucleus sampling value.                                        |
| `stop`               | Stop sequence(s) for text generation.                          |
| `toolChoice`         | Constrain which tool (if any) the model may call.              |
| `parallelToolCalls`  | Request that the provider avoid parallel tool calls.           |
| `providerOptions`    | Raw provider-specific fields, applied after normalized values. |

`providerOptions` is shallow-merged when combining agent defaults with
per-turn overrides:

```typescript
const agent = new Agent({
  provider,
  model,
  providerOptions: { seed: 1 },
});

// Per-turn providerOptions shallow-merge with the agent default
await agent.send("Go", { providerOptions: { metadata: { source: "send" } } }).final;
// Request receives: { seed: 1, metadata: { source: "send" } }
```

## Context usage

`agent.context()` returns a token estimate for the current conversation state —
useful for checking how much context has been consumed before the next `send()`.

```typescript
const usage = agent.context();
console.log(`Total estimated tokens: ${usage.total}`);
console.log(`From messages: ${usage.messages}`);
console.log(`From system prompt: ${usage.system}`);
console.log(`From tools: ${usage.tools}`);
```

The returned `ContextUsage` object includes:

| Field           | Description                                             |
| --------------- | ------------------------------------------------------- |
| `total`         | Total estimated tokens across all components.           |
| `system`        | Tokens from the system prompt.                          |
| `tools`         | Tokens from local executable tools.                     |
| `mcpTools`      | Tokens from MCP-provided tools.                         |
| `providerTools` | Tokens from provider-side tools (web search, etc.).     |
| `messages`      | Tokens from the conversation history.                   |
| `limit`         | Context limit (if provided at construction time).       |
| `free`          | Remaining tokens before the limit (if `limit` is set). |

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
