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
// { in, out, cachedIn?, cacheWriteIn?, reasoningOut?, breakdown: UsageEntry[] }
```

`cachedIn` and `cacheWriteIn` are already counted inside `in`, and `reasoningOut`
is already inside `out`. Don't add them again — that's the classic
double-counting bug. Since 0.34.1 these two are populated on Anthropic and
OpenRouter as well, because Axle asks for caching there by default (see
[Prompt caching](/concepts/providers#prompt-caching)).

`breakdown` holds one row per provider request, in request order — not one row
per model. A step that fans out (Anthropic `pause_turn` follow-ups, a tool loop
with several steps) yields one row per request, each with that request's own
`in` and `out`, so each row can be priced at the tier its prompt size selects.
The top-level `in`/`out` are still the totals.

```typescript
for (const entry of result.usage.breakdown) {
  console.log(entry.provider, entry.model, entry.agent, entry.in, entry.out);
}
```

Each row also carries `requestedModel` (what you asked for — differs from
`model` when the provider reports another id), `agent` (the `Agent.name` that
made the request, when it has one — subagent rows sit between the parent's own
rows), and `at` (ISO 8601, when the provider finished). `provider` is the
provider's `id` (`"anthropic"`, `"openai"`, `"google"`, `"openrouter"` — note
Gemini rows changed from `"Gemini"` to `"google"` in 0.35.0) and is absent for
a provider with no `id`.

Entries *explain* the aggregate; they don't add to it. A reader that assumed
one row per model — a cost table keyed by `provider + model`, say — now groups
the rows first. To price a `Stats`, use `computeCost`:

```typescript
import { computeCost } from "@fifthrevision/axle";

const cost = computeCost(usage, catalog);
// { usd, priced, unpriced, pricedWith? }
```

It prices each row at its own provider, model and tier, and reports the rows it
couldn't price rather than guessing. [Model catalog &
cost](/concepts/model-catalog#what-a-run-cost) covers where `catalog` comes from
and what an unpriced row means.

If you write a tool that calls a model, report its usage so it rolls up.
`breakdown` is required — a hand-built `Stats` needs rows, so build it with
`attributeStats`:

```typescript
import { attributeStats } from "@fifthrevision/axle";

async execute(input, ctx) {
  const r = await generate({ provider, model, messages });
  if (r.usage) ctx.reportUsage?.(r.usage);
  return "...";
}

// a tool that calls a model API directly:
ctx.reportUsage(
  attributeStats(
    { in: 900, out: 120 },
    { provider: "openai", model: "gpt-5", requestedModel: "gpt-5" },
  ),
);
```

`createAgentTool` already does the `reportUsage` part for you.

## Next

- [Observability reference](/reference/observability)
- [Model catalog & cost](/concepts/model-catalog) — turning a `Stats` into dollars
- [Results & errors](/concepts/results-and-errors)
