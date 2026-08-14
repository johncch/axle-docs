---
title: Subagents & parallelism
description: Delegating to child agents and running a tool over many inputs at once.
---

# Subagents & parallelism

::: warning Experimental
`createAgentTool` and `parallelize` are marked experimental. Their rendering and
result shapes may change in a minor release.
:::

## A subagent as a tool

`createAgentTool` turns an `Agent` into an executable tool. The parent hands off
bounded work and gets back only the final answer — the child's whole conversation
never enters the parent's context.

```typescript
import { Agent, createAgentTool, anthropic } from "@fifthrevision/axle";
import * as z from "zod";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);

const research = createAgentTool({
  name: "research",
  description: "Research a topic in depth and report the key findings",
  schema: z.object({ topic: z.string() }),
  createAgent: () =>
    new Agent({
      provider,
      model: "claude-haiku-4-5", // cheaper model for the grunt work
      system: "You are a thorough researcher. Report only what you verified.",
      providerTools: [{ type: "provider", name: "web_search" }],
    }),
  prompt: ({ topic }) => `Research ${topic}. Report the three most important findings.`,
});

const lead = new Agent({
  provider,
  model: "claude-opus-4-5",
  tools: [research],
});

const result = await lead.send("Compare Rust and Go for building a network proxy.").final;
```

That's the whole point of the pattern. The parent's context holds three
findings rather than forty pages of search results, and your expensive model
never has to read the raw material.

**Do create a fresh child per call.** `createAgent` runs on every invocation for
exactly this reason — a shared child accumulates history across unrelated calls,
and gets confused in ways that are hard to debug.

## What crosses the boundary

| Direction | What flows |
| --- | --- |
| Parent → child | The rendered `prompt`, `request` overrides, `ctx.signal` |
| Child → parent | The final response string, token usage, turn events |

Notably *not* flowing: the child's messages. If the child fails, the parent gets
`Error("Subagent failed: …")`, and fatal or abort errors are rebuilt without the
child's `messages`/`partial` so the parent never adopts another conversation's
history. Usage is kept, since you still paid for it.

## Rendering a nested run

Child turn events get forwarded through `ctx.emit`, so the subagent shows up as
a `SubagentAction` part carrying its own `children` turns:

```tsx
if (part.kind === "agent") {
  return (
    <details>
      <summary>{part.detail.name} — {part.status}</summary>
      {part.detail.children.map((turn) => (
        <TurnView key={turn.id} turn={turn} />
      ))}
    </details>
  );
}
```

It's recursive — the same component that renders top-level turns renders the
nested ones, which is a nice property to get for free.

## Accounting across models

Usage rolls up automatically, and `breakdown` tells you where it all went:

```typescript
result.usage.in; // total across parent and children
for (const entry of result.usage.breakdown ?? []) {
  console.log(entry.provider, entry.model, entry.in, entry.out);
}
```

Entries *explain* the aggregate rather than adding to it, so don't sum them on
top.

If you write a tool that calls a model directly instead of going through
`createAgentTool`, report the usage yourself:

```typescript
async execute(input, ctx) {
  const r = await generate({ provider, model, messages });
  if (r.usage) ctx.reportUsage?.(r.usage);
  return "...";
}
```

## Running one tool over many inputs

`parallelize` wraps any tool in a batch version:

```typescript
import { parallelize } from "@fifthrevision/axle";

const researchBatch = parallelize(research, {
  maxItems: 20,
  maxConcurrency: 4,
});

const lead = new Agent({ provider, model, tools: [researchBatch] });
```

The generated tool is called `research_batch` and takes `{ items: [...] }`. Now
a single model turn can fan out over twenty topics instead of making twenty
sequential tool calls.

What you're guaranteed:

- Results preserve input order.
- Ordinary per-item failures are reported per item, not as a batch failure.
- Fatal and abort errors still propagate and terminate the run.
- The wrapped tool's `kind` is inherited, so batched subagents still render as
  subagent activity.

```typescript
interface ParallelToolResult<TInput> {
  index: number;
  input: TInput;
  ok: boolean;
  output?: string | ToolResultPart[];
  error?: { type: "execution"; message: string };
}
```

Defaults: `maxItems: 50`, `maxConcurrency: 8`, `maxResultBytes: 20 MiB`.

You can offer both the single and the batch version and let the model choose:

```typescript
tools: [research, parallelize(research)];
```

## Choosing a shape

| Situation | Reach for |
| --- | --- |
| Isolating a noisy subtask from the parent's context | `createAgentTool` |
| Using a cheaper model for bulk work | `createAgentTool` |
| The same operation over a known list | `parallelize` |
| Both | `parallelize(createAgentTool(...))` |
| Fan-out you control, not the model | `Promise.all` over `generate()` |

That last row is worth dwelling on. If *your code* already knows the work list,
you don't need a tool at all. `generate()` has no queue, so a plain `Promise.all`
is simpler, cheaper, and far more predictable than teaching a model to fan out
for you.

## See also

- [Tools](/concepts/tools#subagents)
- [Tools reference](/reference/tools#createagenttool)
- [Observability](/concepts/observability#token-usage)
