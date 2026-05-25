---
title: Procedural memory
description: Let the agent learn corrections and apply them on later runs.
---

# Procedural memory

An agent can use a memory implementation to extract durable instructions from
feedback and apply them to future runs. Pass any object implementing the
`AgentMemory` interface as `memory` in the agent config.

In 0.20.0, the `ProceduralMemory` class moved out of the core
`@fifthrevision/axle` package into the CLI. Hosts should provide their own
memory implementations, or use the CLI behavior through job files.

The example below shows a minimal in-memory implementation to illustrate the
pattern. Run the script twice — the second run will already apply the feedback
the first run learned.

Source: [`examples/scripts/simple-memory.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-memory.ts)

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";
import type { AgentMemory, MemoryContext } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

/**
 * A minimal in-process memory that extracts "Always ..." corrections from
 * the conversation and prepends them to subsequent runs as instructions.
 */
class ProceduralMemory implements AgentMemory {
  private instructions: string[] = [];

  async recall() {
    if (this.instructions.length === 0) return {};
    const numbered = this.instructions.map(
      (instruction, index) => `${index + 1}. ${instruction}`,
    );
    return { systemSuffix: `## Learned Instructions\n\n${numbered.join("\n")}` };
  }

  async record(context: MemoryContext) {
    const latestCorrection = [...context.messages]
      .reverse()
      .find(
        (message) =>
          message.role === "user" &&
          message.content.toString().includes("Always"),
      );
    if (!latestCorrection || typeof latestCorrection.content !== "string") return;
    if (!this.instructions.includes(latestCorrection.content)) {
      this.instructions.push(latestCorrection.content);
    }
  }
}

const agent = new Agent({
  provider,
  model,
  system: "You are a helpful assistant that summarizes text.",
  name: "summarizer",
  memory: new ProceduralMemory(),
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
```
