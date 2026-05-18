---
title: Procedural memory
description: Let the agent learn corrections and apply them on later runs.
---

# Procedural memory

`ProceduralMemory` lets the agent extract durable instructions from feedback
and apply them to future runs of the same agent (matched by `name`).

Run the script twice — the second run will already apply the feedback the
first run learned.

Source: [`examples/scripts/simple-memory.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-memory.ts)

```typescript
import { Agent, ProceduralMemory, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const memory = new ProceduralMemory({
  provider,
  model,
});

const agent = new Agent({
  provider,
  model,
  system: "You are a helpful assistant that summarizes text.",
  name: "summarizer",
  // scope: { user: "demo" },
  memory,
});

agent.on((event) => {
  if (event.type === "text:delta") {
    process.stdout.write(event.delta);
  }
});

try {
  // Turn 1: Ask for a summary
  console.log("[Turn 1] Asking for a summary...\n");
  await agent.send("Summarize the benefits of exercise.").final;

  // Turn 2: Give a correction — this is what memory will extract
  console.log("\n\n[Turn 2] Giving feedback...\n");
  await agent.send(
    "That's too long. Always use bullet points and keep each point to one sentence."
  ).final;

  // Turn 3: New task — on first run this won't benefit from memory yet,
  // but on subsequent runs the recalled instructions will shape the response
  console.log("\n\n[Turn 3] New task...\n");
  await agent.send("Summarize the benefits of reading books.").final;

  console.log("\n");
} catch (e) {
  console.error(e);
}

console.log("[Complete]");
console.log("[Tip] Run this script again to see learned instructions applied from the start.");
console.log("[Tip] Check .axle/memory/procedural/ to see the stored instructions.");
```
