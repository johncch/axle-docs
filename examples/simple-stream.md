---
title: stream()
description: Streaming generation with a tool — text:delta, tool:exec-* events.
---

# stream()

`stream()` runs the same tool loop as `generate()`, but returns a handle
that emits events as text and tool activity arrive. Each text/thinking block
gets its own `start` / `delta` / `end` cycle.

Source: [`examples/scripts/simple-stream.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-stream.ts)

```typescript
import z from "zod";
import { stream, anthropic } from "@fifthrevision/axle";
import type { ExecutableTool } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const setNameTool: ExecutableTool<z.ZodObject<{ name: z.ZodString }>> = {
  name: "setName",
  description: "Set your name in the app",
  schema: z.object({
    name: z.string().describe("The name to call yourself"),
  }),
  async execute() {
    return "success";
  },
};

const handle = stream({
  provider,
  model,
  messages: [
    {
      role: "user",
      content:
        "Tell me a 3-sentence story with a character's name, then call setName with that name.",
    },
  ],
  tools: [setNameTool],
  onToolCall: async (name, parameters) => {
    console.log(`\n[tool] ${name} ${JSON.stringify(parameters)}`);
    return { type: "success", content: "success" };
  },
});

handle.on((event) => {
  switch (event.type) {
    case "text:start":         console.log("[text start]"); break;
    case "text:delta":         process.stdout.write(event.delta); break;
    case "text:end":           console.log("\n[text end]"); break;
    case "tool:exec-start":    console.log(`[exec] ${event.name}`); break;
    case "tool:exec-complete": console.log("[exec complete]"); break;
    case "error":              console.error(event.error); break;
  }
});

const result = await handle.final;
if (!result.ok) throw new Error(result.error.kind);
```

Notice the events here (`text:start`, `text:end`, `tool:exec-*`) differ from
those emitted by `agent.on()`. See [Streaming](/guide/streaming) for the
full picture.
