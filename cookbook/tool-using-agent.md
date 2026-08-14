---
title: Tool-using agent
description: A complete agent that calls tools, streams progress, and continues the conversation.
---

# Tool-using agent

This is the recipe most agents start from: one tool, live progress in the
terminal, and a follow-up question that reuses the conversation.

```typescript
import { Agent, anthropic, type ExecutableTool } from "@fifthrevision/axle";
import * as z from "zod";

const setName: ExecutableTool = {
  name: "set_name",
  description: "Record the character's name in the app",
  schema: z.object({
    name: z.string().describe("The character's name"),
  }),
  async execute({ name }, ctx) {
    ctx.emit(`Saving ${name}…`);
    await db.save(name);
    return "success";
  },
};

const agent = new Agent({
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-sonnet-4-5",
  tools: [setName],
});

agent.on((event) => {
  switch (event.type) {
    case "part:start":
      if (event.part.type === "action") {
        console.log(`\n[tool] ${event.part.detail.name} requested`);
      }
      break;
    case "text:delta":
      process.stdout.write(event.delta);
      break;
    case "action:running":
      console.log(`[tool] executing`);
      break;
    case "action:progress":
      console.log(`[tool] ${event.chunk}`);
      break;
    case "action:complete":
      console.log(`[tool] done`);
      break;
    case "action:error":
      console.error(`[tool] failed: ${event.error.message}`);
      break;
  }
});

const result = await agent.send(
  "Tell me a three-sentence story with a named character, then record the name.",
).final;

if (!result.ok) throw new Error(result.error.message);
console.log(`\nusage: ${result.usage.in} in / ${result.usage.out} out`);

// Follow-up — same callbacks, no re-wiring, history already there
const followUp = await agent.send("What was the character's name again?").final;
if (followUp.ok) console.log(followUp.response);
```

## A few things worth noticing

**The description and schema are the prompt.** That's where the model decides
whether to call your tool and what to pass it. Adding `.describe()` to each field
is the cheapest quality improvement available — nothing else in this recipe moves
tool-call accuracy as much.

**One send, several model requests.** The agent calls the model, runs the tool,
and calls the model again with the result — all inside that single `await`. Those
are [steps](/concepts/anatomy-of-a-send#step-the-execution-lens), and you mostly
don't have to think about them.

**`ctx.emit` is there for slow tools.** Whatever you pass shows up as
`action:progress` while `execute` is still running. Leave it out and a
ten-second tool just looks frozen to your user.

**You wire callbacks once.** `agent.on()` applies to every send from then on, so
there's no per-turn setup.

**This example handles events directly because it's a terminal program.** For a
UI, pass them to a [`Transcript`](/concepts/transcripts) instead and render
`transcript.turns` — you get the same information already assembled, and you
don't maintain a reducer. See [Streaming to a UI](/cookbook/streaming-ui).

## Handling tool failures

Most of the time, just throw. The model sees the error and usually works around
it, and the run continues:

```typescript
async execute({ city }) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
  return await res.text();
}
```

To terminate the run instead, throw `AxleToolFatalError`:

```typescript
import { AxleToolFatalError } from "@fifthrevision/axle";

async execute(input, ctx) {
  if (!sandboxAlive) {
    throw new AxleToolFatalError("Sandbox destroyed", { toolName: "run_command" });
  }
}
```

Default to ordinary throws — models are surprisingly good at recovering from a
tool that says "that didn't work." Save fatal for when carrying on would be
incoherent.

## Forwarding cancellation

Please pass `ctx.signal` into your I/O. Without it, `handle.cancel()` stops the
agent but leaves your fetch running, which is the kind of leak that only shows up
under load:

```typescript
async execute({ url }, ctx) {
  const res = await fetch(url, { signal: ctx.signal });
  return await res.text();
}
```

## Bounding the loop

An agent with tools can, occasionally, go around in circles. Worth capping:

```typescript
const agent = new Agent({ provider, model, tools, maxOutputTokens: 4096 });
```

For a hard cap on model requests, drive the loop yourself with
[`stream()`](/concepts/generate-and-stream) and `maxSteps`, or interrupt with
[`agent.stop()`](/cookbook/cancellation).

## See also

- [Tools](/concepts/tools) — provider tools, MCP, subagents
- [Streaming to a UI](/cookbook/streaming-ui)
- [Subagents & parallelism](/cookbook/subagents)
