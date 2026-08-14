---
title: generate() & stream()
description: The tool loop, without the conversation management.
---

# generate() & stream()

These two functions are the primitive. `Agent` is built on `stream()` and adds
conversation management on top — so when you don't want a conversation, drop to
this layer directly. Batch jobs, stateless request handlers, evaluation
harnesses, or your own conversation container.

Because there's no conversation here, there are no turns. These functions deal
in **messages** and **steps**, and `stream()` emits
[`StreamEvent`](/concepts/stream-events) rather than
the `TurnEvent`s you'd get from `Agent`.

| | `generate()` | `stream()` |
| --- | --- | --- |
| Returns | `Promise<GenerateResult>` | A handle with `.on()` and `.final` |
| Events | None | `StreamEvent` |
| Cancellable | Via `signal` | Via `signal` or `handle.cancel()` |

Both run the complete tool loop. Neither keeps any history — you pass `messages`
in and get `messages` back.

## generate()

```typescript
import { generate } from "@fifthrevision/axle";

const result = await generate({
  provider,
  model,
  messages: [{ role: "user", content: "What's the weather in Lisbon?" }],
  tools: [getWeather],
});

if (!result.ok) throw new Error(result.error.message);
result.response; // the final AxleAssistantMessage
result.messages; // everything produced this run
```

Watch out for one difference from `Agent`: `response` is the whole assistant
**message**, not a string. Reach into `content` for the parts you want. It's
deliberate — at this level you usually want more than the text.

## stream()

```typescript
import { stream } from "@fifthrevision/axle";

const handle = stream({ provider, model, messages, tools: [getWeather] });

handle.on((event) => {
  if (event.type === "text:delta") process.stdout.write(event.delta);
});

const result = await handle.final;
```

You don't have to hurry to register callbacks — processing starts on the next
microtask, so anything registered synchronously after the call sees every event.

`handle.cancel(reason)` aborts, and `handle.final` then rejects with
`AxleAbortError` carrying `reason`, `usage`, `messages`, and `partial`.

## Passing an Instruct

Both take an `Instruct` in place of a final user message, which is how you get
structured output without an agent:

```typescript
const result = await generate({
  provider,
  model,
  messages: previousMessages, // prior context — optional
  instruct: new Instruct({
    prompt: "Answer {{question}}.",
    schema: z.object({ answer: z.string() }),
  }).withInput("question", "Should we proceed?"),
});

if (result.ok) result.response.answer; // typed
```

When you give both `messages` and `instruct`, `messages` is treated as prior
context and the rendered `Instruct` is appended as the new user message. With
`instruct`, `response` becomes the parsed value rather than a message.

## Tools

Supply tools inline, or hand over a prebuilt registry — but not both.

```typescript
stream({ provider, model, messages, tools: [a], providerTools: [b] });
stream({ provider, model, messages, registry: myRegistry });
```

Passing both throws `AxleError` with code `TOOL_OPTIONS_CONFLICT`, because
there's no sensible way to merge them.

There's also `onToolCall`, which intercepts tool calls without registering
`ExecutableTool` objects at all:

```typescript
stream({
  provider,
  model,
  messages,
  onToolCall: async (name, params, ctx) => {
    if (name !== "lookup") return null; // fall through to the registry
    return { type: "success", content: JSON.stringify(await lookup(params)) };
  },
});
```

Return `null` or `undefined` and it defers to the registry, so you can intercept
selectively.

## Bounding the loop

```typescript
const result = await generate({ provider, model, messages, tools, maxSteps: 8 });
const result2 = await generate({ provider, model, messages, tools, maxContextTokens: 100_000 });
```

`maxSteps` caps model requests. `maxContextTokens` caps the context budget,
checked after each step's tools are answered against that step's reported usage.

Crossing either one is a **stop, not an error** — you get `ok: true` with
`stopped: "max-steps" | "token-limit"` and everything accumulated so far. The
conversation is well-formed and continuable, and it's your call whether to
compact and carry on. Non-positive limits throw at call time.

See [Results & errors](/concepts/results-and-errors#stops-arent-errors).

## Steering the loop yourself

```typescript
handle.onToolBatchComplete((message) => (done ? "finish" : "continue"));
```

This runs after each tool batch settles. `"finish"` ends the run without another
provider request — every tool in that batch has already completed and committed,
so nothing is lost. It's the primitive behind `agent.stop()`.

## One step at a time

`generateStep()` performs exactly one provider request. No loop, no tool
execution, no retries. It's the bottom of the stack — reach for it when you're
building your own orchestration and want Axle purely for provider normalization.

## When to use Agent instead

Use `Agent` when you want history management, a FIFO queue, turn events, session
snapshots, compaction, or lazy MCP resolution. That's a fair amount of machinery
to rebuild, and `Agent` is essentially `stream()` plus exactly those things.

## Next

- [Stream events](/concepts/stream-events) — what `stream()` emits, in full
- [generate() & stream() reference](/reference/generate-stream)
