---
title: Results & Errors
description: How generate, stream, and Agent.send report success and failure.
---

# Results & Errors

`generate(...)`, `stream(...).final`, and `agent.send(...).final` all resolve
to a two-state result:

```typescript
if (!result.ok) {
  result.error.kind; // "model" | "tool" | "parse"
  if (result.error.kind === "parse") {
    result.error.message;
  }
  return;
}

result.response; // always present when ok is true
```

## What `response` contains

| Call                              | `response` value                          |
| --------------------------------- | ----------------------------------------- |
| `generate({ messages })`          | Final assistant message.                  |
| `stream({ messages }).final`      | Final assistant message.                  |
| `agent.send("...")`               | Assistant text.                           |
| `agent.send(instruct)` (schema)   | Parsed schema value (typed).              |
| `agent.send(instruct)` (no schema)| Assistant text.                           |

## Failure kinds

- `model` — the provider returned an error or refusal.
- `tool` — a local or provider tool call failed.
- `parse` — the model's response could not be parsed against the schema.
  `result.error.message` contains the parser's explanation.

Abort, fatal-tool, configuration, and unexpected execution errors still
**throw** — they are not returned as `ok: false`.

## Usage stats

`result.usage` reports token counts for the run. The aggregate fields (`in`,
`out`, etc.) are always present; detail fields appear when providers report
them. The optional `breakdown` array attributes spending by provider and model
so cost can be reconstructed even when subagents run on different models:

```typescript
type TokenStats = {
  in: number;             // total input tokens
  out: number;            // total output tokens
  cachedIn?: number;      // input tokens served from cache (included in `in`)
  cacheWriteIn?: number;  // input tokens written to cache (included in `in`)
  reasoningOut?: number;  // output tokens spent on reasoning (included in `out`)
};

type UsageEntry = TokenStats & {
  provider: string;       // provider identifier (e.g. "anthropic")
  model: string;          // model identifier
};

type Stats = TokenStats & {
  breakdown?: UsageEntry[]; // one entry per provider+model pair
};
```

```typescript
const result = await agent.send("Hello").final;
if (result.ok) {
  console.log(`in=${result.usage.in}, out=${result.usage.out}`);
  if (result.usage.cachedIn) {
    console.log(`cached=${result.usage.cachedIn}`);
  }
  if (result.usage.reasoningOut) {
    console.log(`reasoning=${result.usage.reasoningOut}`);
  }

  // Cost reconstruction with breakdown (experimental)
  if (result.usage.breakdown) {
    for (const entry of result.usage.breakdown) {
      console.log(`${entry.provider}/${entry.model}: ${entry.in} in, ${entry.out} out`);
    }
  }
}
```

Breakdown entries **explain** the aggregate totals — never add them to the
aggregates again. Use `mergeStats` to combine multiple `Stats` objects;
`addStats` and `createStats` are also exported for custom accumulation.

## Cancellation

Cancellation follows standard JavaScript abort semantics:

- `handle.cancel(reason)` aborts a `stream()` or `agent.send()` handle.
- `stream().final`, `generate(...)`, and `agent.send(...).final` reject with
  an error whose `name` is `"AbortError"`.
- Axle abort errors preserve `reason`, `usage`, and partial state where
  available (`messages`, `partial`, and for `Agent.send`, `turn`).

```typescript
try {
  const result = await handle.final;
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    // handle cancellation; partial state is on err
  } else {
    throw err;
  }
}
```

## Fatal tool errors

Throwing `AxleToolFatalError` from a tool's `execute` stops the run
immediately, without retrying or exposing the error to the model. The thrown
error carries available partial output, messages, usage, and tool context.

## Tool-level abort errors

A tool's own internal `AbortError` (e.g. a `fetch` timeout or internal
`AbortController`) no longer terminates the run while the run's signal is
live — the model receives it as an ordinary tool error and can retry or
continue. To stop the run immediately, throw `AxleAbortError` (cancellation)
or `AxleToolFatalError` (unrecoverable failure) explicitly.
