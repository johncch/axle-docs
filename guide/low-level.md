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
if (!result.ok) throw new Error(result.error.kind);
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
result.response; // final assistant message
```

## Model request options

Both `stream()` and `generate()` accept normalized model request options as
top-level fields. Pass them directly alongside `provider`, `model`, and
`messages`:

```typescript
const result = await generate({
  provider,
  model,
  messages,
  maxOutputTokens: 512,
  temperature: 0.3,
  topP: 0.9,
  stop: ["END"],
  reasoning: true,
});
```

For provider-specific controls that are not represented by the normalized
fields, use `providerOptions`:

```typescript
const result = await generate({
  provider,
  model,
  messages,
  maxOutputTokens: 512,
  providerOptions: {
    prompt_cache_key: "thread-123",
  },
});
```

See [Agent — model request options](/guide/agent#model-request-options) for
the full option reference.

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

## When to use which

- Use **`Agent`** for ongoing conversations — it manages history, system
  prompt, and callback wiring for you.
- Use **`stream()`** when you control message state yourself but want
  incremental output.
- Use **`generate()`** for one-shot calls where you don't need to react to
  streaming events.

Both `stream()` and `generate()` handle the full tool-call loop
automatically.
