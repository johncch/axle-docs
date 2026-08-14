---
title: Structured output
description: Typed responses with Zod schemas, with and without an agent.
---

# Structured output

Hand a Zod schema to `Instruct` and `result.response` comes back parsed and
typed. No JSON parsing on your side, no casting.

```typescript
import { Agent, Instruct, anthropic } from "@fifthrevision/axle";
import * as z from "zod";

const agent = new Agent({
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-sonnet-4-5",
});

const instruct = new Instruct({
  prompt: "Tell me about {{planet}}.",
  schema: z.object({
    name: z.string(),
    distanceFromSunKm: z.number(),
    moons: z.array(z.string()).describe("Named moons, largest first"),
    habitable: z.boolean(),
  }),
}).withInput("planet", "Mars");

const result = await agent.send(instruct).final;
if (!result.ok) throw new Error(result.error.message);

result.response.moons; // string[] — fully typed
result.response.distanceFromSunKm; // number
```

Axle compiles your schema into output-format instructions, prepends them to the
prompt, and parses the reply back. `.describe()` text flows into those
instructions, so it's worth adding wherever a field name isn't self-explanatory.

## Without an agent

For a one-shot call with no history, pass the same `Instruct` to `generate()`:

```typescript
import { generate } from "@fifthrevision/axle";

const result = await generate({
  provider,
  model,
  instruct,
});

if (result.ok) result.response.moons;
```

`stream()` works identically and gives you deltas as the JSON arrives — useful
for a progress indicator, less so for rendering, since partial JSON is not
parseable.

## Reusable templates

`withInputs()` and `withInput()` return new instances, so one schema serves many
calls:

```typescript
const template = new Instruct({
  prompt: "Extract the key facts from {{document}}.",
  schema: z.object({ facts: z.array(z.string()) }),
});

const results = await Promise.all(
  documents.map((doc) => generate({ provider, model, instruct: template.withInput("document", doc) })),
);
```

Note these run concurrently because `generate()` has no queue. The same code
through `agent.send()` would serialize.

## When parsing fails

A malformed response resolves as an error, not a throw:

```typescript
const result = await agent.send(instruct).final;

if (!result.ok) {
  if (result.error.kind === "parse") {
    console.error("Model returned unparseable output:", result.error.message);
    // retry, fall back, or surface it
  }
  return;
}
```

One subtlety that looks alarming the first time — and this applies to
`generate()` and `stream()`, not to `Agent`. If a loop limit ended the run before
the model got to its final answer, you'll get a parse error **with** a `stopped`
marker. That isn't the model misbehaving; the conversation is perfectly
continuable:

```typescript
const result = await generate({ provider, model, instruct, tools, maxSteps: 5 });

if (!result.ok && result.error.kind === "parse" && result.stopped) {
  // hit maxSteps or the token budget — compact and continue rather than retrying
}
```

`Agent` has no loop budgets, so its results carry no `stopped`. Use
[`agent.stop()`](/cookbook/cancellation) if you need to bound an agent run.

## Making schemas easier for the model

If you're seeing more parse failures than you'd like, these usually help:

- **Keep schemas flat.** Deeply nested objects fail noticeably more often.
- **Prefer `z.enum([...])`** to a free-form string when you know the value set.
- **`.describe()` anything ambiguous** — units, formats, ordering.
- **Ask for fewer fields per call.** Two reliable calls beat one flaky one.
- **Watch your required fields.** Optional ones are genuinely optional to the
  model, but a required field it can't determine is a common cause of failures.

## Structured output with tools

These compose happily. The model can call tools and still return a schema-shaped
final answer:

```typescript
const agent = new Agent({ provider, model, tools: [searchTool] });

const result = await agent.send(
  new Instruct({
    prompt: "Research {{topic}} and summarize.",
    schema: z.object({
      summary: z.string(),
      sources: z.array(z.string()),
    }),
  }).withInput("topic", "Rust async runtimes"),
).final;
```

The schema instructions apply to the final message, after the tool loop has
settled — so intermediate tool calls don't have to produce JSON.

## See also

- [Instruct](/concepts/instruct)
- [Results & errors](/concepts/results-and-errors)
- [Instruct reference](/reference/instruct)
