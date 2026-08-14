---
title: Quick Start
description: A working agent, a tool loop, and structured output in a few minutes.
---

# Quick Start

We'll build up in five small steps. Each one is a complete, runnable program.

## 1. Send a message

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";

const agent = new Agent({
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-sonnet-4-5",
  system: "You are a concise assistant.",
});

const result = await agent.send("What is the capital of France?").final;
if (!result.ok) throw new Error(result.error.message);

console.log(result.response); // "Paris."
console.log(result.usage); // { in: 24, out: 4 }
```

Two things to notice.

`send()` hands you a *handle* right away, and `handle.final` is the promise you
await. That split exists so you can cancel a run — more on that later.

And results come back as a two-state union, so you check `ok` before reading
`response`. TypeScript enforces it, which means you can't forget. See
[Results & errors](/concepts/results-and-errors).

## 2. Keep the conversation going

The agent owns its conversation, so every `send()` builds on the ones before it.
You don't manage a message array.

```typescript
await agent.send("Hi, my name is Ana.").final;
const r = await agent.send("What's my name?").final;
// → "Your name is Ana."
```

Sends queue up in order, so you can fire several without awaiting each one.

## 3. Add a tool

A tool is a plain object — name, description, Zod schema, and an `execute`
function. Axle runs the whole call-execute-respond loop for you.

```typescript
import { Agent, anthropic, type ExecutableTool } from "@fifthrevision/axle";
import * as z from "zod";

const getWeather: ExecutableTool = {
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({ city: z.string() }),
  async execute({ city }) {
    return JSON.stringify({ city, temp: 72, condition: "sunny" });
  },
};

const agent = new Agent({
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-sonnet-4-5",
  tools: [getWeather],
});

const result = await agent.send("What's the weather in Lisbon?").final;
```

Behind that single `await`, the model asked for the tool, Axle ran it, and the
model got the answer and replied. That took two round trips to the provider —
they're called [steps](/concepts/anatomy-of-a-send), and you don't have to think
about them. You just get the final answer.

## 4. Get structured output

Wrap your prompt in an `Instruct` with a Zod schema, and `result.response` comes
back parsed and typed.

```typescript
import { Instruct } from "@fifthrevision/axle";
import * as z from "zod";

const instruct = new Instruct({
  prompt: "Tell me about Mars.",
  schema: z.object({
    name: z.string(),
    distanceFromSunKm: z.number(),
    moons: z.array(z.string()),
  }),
});

const result = await agent.send(instruct).final;
if (!result.ok) throw new Error(result.error.message);

result.response.moons; // string[] — your editor knows
```

No JSON parsing, no casting. Axle compiles the schema into instructions for the
model, then parses what comes back.

## 5. Stream it

`agent.on()` registers a callback that fires for every send from then on. You
wire it once.

```typescript
agent.on((event) => {
  if (event.type === "text:delta") process.stdout.write(event.delta);
});

await agent.send("Write a haiku about compilers.").final;
```

Those are [turn events](/concepts/turn-events) — the render-layer stream.

Writing deltas straight to stdout is fine for a terminal. For an actual UI, don't
handle events yourself: hand them to a [`Transcript`](/concepts/transcripts) and
render what it gives you.

```typescript
import { Transcript } from "@fifthrevision/axle";

const transcript = new Transcript();
agent.on((event) => transcript.apply(event));

await agent.send("Write a haiku about compilers.").final;

transcript.turns; // ready to render
```

## That's the whole library, roughly

An agent, a tool, a schema, and an event stream. Everything else is detail on top
of these four ideas.

Good places to go next:

- [Anatomy of a send](/concepts/anatomy-of-a-send) — what actually happened above
- [Agent](/concepts/agent) — queueing, interruption, cancellation
- [Tools](/concepts/tools) — provider tools, MCP servers, subagents
- [Cookbook](/cookbook/tool-using-agent) — complete recipes you can lift
