---
title: Agent with tools
description: A multi-turn agent that calls a local tool, then runs a follow-up turn.
---

# Agent with tools

An agent with one tool, run across two turns. The second `send()` reuses the
agent's history automatically — no need to pass prior messages.

Source: [`examples/scripts/simple-agent.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-agent.ts)

```typescript
import z from "zod";
import { Agent, Instruct, anthropic } from "@fifthrevision/axle";
import type { ExecutableTool } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const setNameTool: ExecutableTool = {
  name: "setName",
  description: "Set your name in the app",
  schema: z.object({
    name: z.string().describe("The name to call yourself"),
  }),
  async execute(input) {
    return "success";
  },
};

const agent = new Agent({ provider, model, tools: [setNameTool] });

const r1 = await agent.send(
  new Instruct({
    prompt:
      "Tell me a 3-sentence story with a character's name, then call setName with that name.",
  }),
).final;
if (!r1.ok) throw new Error(r1.error.kind);
console.log(r1.response);

// Follow-up turn — history is preserved
const r2 = await agent.send("What was the character's name again?").final;
if (!r2.ok) throw new Error(r2.error.kind);
console.log(r2.response);
```

## With streaming events

To stream text and watch tool calls as they happen, register a callback once
with `agent.on(...)`. It fires for every subsequent `send()`.

```typescript
agent.on((event) => {
  switch (event.type) {
    case "text:delta":
      process.stdout.write(event.delta);
      break;
    case "part:start":
      if (event.part.type === "action") {
        console.log(`\n[tool] ${event.part.detail.name}`);
      }
      break;
    case "action:complete":
      console.log("[tool complete]");
      break;
  }
});
```

See [Streaming](/guide/streaming) for the full event list.
