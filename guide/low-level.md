---
title: Low-level APIs
description: stream() and generate() — full control without conversation management.
---

# Low-level APIs

`Agent` is built on two lower-level primitives that can be used directly when
you want full control without conversation management.

## `stream()`

`stream()` runs a tool loop over a streaming request and returns a handle
with callbacks for real-time output:

```typescript
import { stream } from "@fifthrevision/axle";

const handle = stream({
  provider,
  model,
  messages: [{ role: "user", content: "Hello" }],
  tools: [myTool],
  onToolCall: async (name, params) => ({ type: "success", content: "result" }),
});

handle.on((event) => {
  if (event.type === "text:delta") process.stdout.write(event.delta);
});

const result = await handle.final;
if (result.ok) {
  if (result.stopped) {
    // "max-iterations" or "token-limit" — everything accumulated so far is
    // in result.messages; resume by passing them back in.
    console.log(`Stopped: ${result.stopped}`);
  }
}
```

## `generate()`

`generate()` does the same but without streaming — it returns the final
result directly as a promise:

```typescript
import { generate } from "@fifthrevision/axle";

const result = await generate({
  provider,
  model,
  messages: [{ role: "user", content: "Hello" }],
  tools: [myTool],
  onToolCall: async (name, params) => ({ type: "success", content: "result" }),
});

if (!result.ok) throw new Error(result.error.kind);
if (result.stopped) {
  // "max-iterations" or "token-limit" — result.messages is the complete exchange.
}
result.response; // final assistant message
```

## Request options

Both `generate()` and `stream()` accept normalized model request options
directly as top-level fields:

```typescript
await generate({
  provider,
  model,
  messages,
  temperature: 0.2,
  topP: 0.9,
  maxOutputTokens: 500,
  stop: ["END"],
  reasoning: true,
});
```

The full normalized option surface (`AxleModelRequestOptions`):

| Option              | Type                     | Description                                                 |
| ------------------- | ------------------------ | ----------------------------------------------------------- |
| `reasoning`         | `boolean`                | Enable/disable provider reasoning or thinking mode.         |
| `maxOutputTokens`   | `number`                 | Maximum output tokens to request.                           |
| `temperature`       | `number`                 | Sampling temperature.                                       |
| `topP`              | `number`                 | Nucleus sampling value.                                     |
| `stop`              | `string \| string[]`     | Stop sequence(s) for text generation.                       |
| `toolChoice`        | `ToolChoice`             | Constrain tool use for this request.                        |
| `parallelToolCalls` | `boolean`                | Request that the provider avoid parallel tool calls.        |
| `providerOptions`   | `ProviderOptions`        | Raw provider-specific fields applied after normalized ones. |
| `signal`            | `AbortSignal`            | Abort signal for cancellation.                              |
| `maxIterations`     | `number`                 | Maximum tool-call loop iterations.                          |
| `maxContextTokens`  | `number`                 | Context budget for the tool loop in tokens.                 |

`ToolChoice` can be `"auto"`, `"none"`, `"required"`, or `{ type: "tool", name: string }`.

### Provider options

Use `providerOptions` for raw provider-specific fields — cache controls,
reasoning budgets, frequency/presence penalties, and so on:

```typescript
await generate({
  provider,
  model,
  messages,
  maxOutputTokens: 500,
  providerOptions: {
    prompt_cache_key: "thread-123",
  },
});
```

Provider adapters apply fields in this order: provider defaults → Axle
normalized options → `providerOptions`. This means `providerOptions`
intentionally wins if it conflicts with a normalized Axle field.

## Passing an Instruct

Both `stream()` and `generate()` accept an `Instruct` as the latest user
turn. When `messages` is provided with `instruct`, `messages` is treated as
prior context and the rendered `Instruct` is appended as the new user
message.

```typescript
import * as z from "zod";
import { generate, Instruct } from "@fifthrevision/axle";

const result = await generate({
  provider,
  model,
  messages: previousMessages,
  instruct: new Instruct({
    prompt: "Answer {{question}}.",
    schema: z.object({
      answer: z.string(),
    }),
  }).withInput("question", "Should we proceed?"),
});

if (!result.ok) throw new Error(result.error.kind);
result.response.answer; // string
```

## TypeScript types

The parameter types for these functions are exported from
`@fifthrevision/axle`:

```typescript
import type { GenerateParams, StreamParams } from "@fifthrevision/axle";
import type { GenerateInstructParams, StreamInstructParams } from "@fifthrevision/axle";
```

## When to use which

- Use **`Agent`** for ongoing conversations — it manages history, system
  prompt, and callback wiring for you.
- Use **`stream()`** when you control message state yourself but want
  incremental output.
- Use **`generate()`** for one-shot calls where you don't need to react to
  streaming events.

Both `stream()` and `generate()` handle the full tool-call loop
automatically.
