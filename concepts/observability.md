---
title: Observability
description: Structured logs, span traces, and where the token numbers come from.
---

# Observability

Axle builds a span tree for every operation. You can consume it as flat
structured logs, as a real trace, or both.

One vocabulary note first: a **trace** here means the span tree from the tracer.
It never means the conversation transcript. Two different things, unfortunately
similar words. See [Glossary](/glossary).

## The common case: structured logs

Hand Axle a `log` function and it creates and owns a tracer behind the scenes.
For most applications this is all you need:

```typescript
const agent = new Agent({
  provider,
  model,
  observability: {
    level: "info",
    log: ({ level, message, fields }) => {
      console.log(JSON.stringify({ level, message, ...fields }));
    },
  },
});
```

Every entry carries `traceId`, `spanId`, and usually `parentSpanId` — enough to
reconstruct the trace skeleton from the log stream alone, without running a
tracing backend at all.

`level` defaults to `"info"`. Reach for `"debug"` in development: tool calls and
the top-level run log at info, while the full span tree (steps, stream
internals) sits at debug depth. So info reads like a narrative and debug reads
like a stack trace.

## Bringing your own tracer

```typescript
import { Tracer, LogWriter, SimpleWriter } from "@fifthrevision/axle";

const tracer = new Tracer({ minLevel: "debug" });
tracer.addWriter(new LogWriter((entry) => logger.log(entry)));
tracer.addWriter(myOtelWriter);

const agent = new Agent({ provider, model, observability: { trace: tracer } });
```

`trace` accepts two shapes:

- A **`Tracer`** — each send becomes its own root span.
- A **`Span`** — sends nest underneath it, which is how you attach an agent run
  to a larger request trace.

Axle attaches its spans but never ends or flushes something you handed it — that
stays your responsibility. When you supply only `log`, Axle owns the tracer and
flushes it at the end of each operation.

The `level` option governs only the tracer Axle creates from `log`. If you bring
your own, set `minLevel` on it instead.

## What the span tree looks like

A send produces roughly this:

```
agent.send                (workflow)
├─ stream                 (internal)
│  ├─ step-1              (llm)
│  ├─ tool:get_weather    (tool)
│  └─ step-2              (llm)
```

`agent.compact()` produces its own `agent.compact` workflow root, with a
`trigger` attribute and an `outcome` of `complete`, `skipped`, or `error`.

Span types are conventions rather than an enum — `workflow`, `llm`, `tool`,
`action`, `internal`.

## Writing a trace writer

```typescript
import type { TraceWriter, SpanData } from "@fifthrevision/axle";

const writer: TraceWriter = {
  onSpanStart(span) {},
  onSpanEnd(span) {
    exporter.record(span); // traceId, spanId, parentSpanId, timings, attributes, result
  },
  async flush() {
    await exporter.flush();
  },
};
```

`onSpanUpdate` and `onEvent` are optional.

LLM and tool spans carry a typed `result` —
`{ kind: "llm", model, request, response, usage, finishReason }` or
`{ kind: "tool", name, input, output }` — so your exporter can render them
natively instead of digging through attributes.

`SimpleWriter` is the built-in human-readable console writer, handy in
development.

## Tools get their own spans

Each tool call has a span, handed to `execute` as `ctx.span`:

```typescript
async execute(input, ctx) {
  ctx.span?.setAttribute("cacheHit", true);
  ctx.span?.debug("fetching", { url });
}
```

## Token usage

There are two different numbers here and they get confused constantly, so:

| | Where it comes from | What it's for |
| --- | --- | --- |
| `result.usage` | The provider reports it | Billing, real accounting |
| `agent.context()` | Estimated locally | Compaction thresholds, UI meters |

```typescript
result.usage;
// { in, out, cachedIn?, cacheWriteIn?, reasoningOut?, breakdown? }
```

`cachedIn` and `cacheWriteIn` are already counted inside `in`, and `reasoningOut`
is already inside `out`. Don't add them again — that's the classic
double-counting bug.

`breakdown` holds one entry per provider+model pair, which is how you reconstruct
cost when a single operation spans models: a subagent on a cheaper model, a
compaction call on a fast one.

```typescript
for (const entry of result.usage.breakdown ?? []) {
  console.log(entry.provider, entry.model, entry.in, entry.out);
}
```

Entries *explain* the aggregate; they don't add to it.

If you write a tool that calls a model, report its usage so it rolls up:

```typescript
async execute(input, ctx) {
  const r = await generate({ provider, model, messages });
  if (r.usage) ctx.reportUsage?.(r.usage);
  return "...";
}
```

`createAgentTool` already does this for you.

## Next

- [Observability reference](/reference/observability)
- [Results & errors](/concepts/results-and-errors)
