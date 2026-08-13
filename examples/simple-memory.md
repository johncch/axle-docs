---
title: Model-directed memory
description: Provide retrieval and writing tools so the model can manage its own memory.
---

# Model-directed memory

`AgentConfig.memory`, `AgentMemory`, and automatic recall/record are removed
in 0.30.0. For model-directed memory, provide ordinary retrieval and writing
tools. Their storage, identity, scope, and authorization stay in the host
application.

The example below shows a minimal in-memory vector store exposed through two
tools (`remember` and `recall`). After recording a fact in turn 1, the agent
retrieves it on its own in turn 3.

```typescript
import { Agent, Instruct, anthropic } from "@fifthrevision/axle";
import type { ExecutableTool, ToolContext } from "@fifthrevision/axle";
import { z } from "zod";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

// A minimal in-memory store
const store = new Map<string, string[]>();

const rememberTool: ExecutableTool = {
  name: "remember",
  description: "Store a fact for later retrieval.",
  schema: z.object({
    key: z.string().describe("The topic or subject."),
    fact: z.string().describe("The fact to store."),
  }),
  async execute({ key, fact }) {
    const existing = store.get(key) ?? [];
    existing.push(fact);
    store.set(key, existing);
    return `Stored fact under "${key}".`;
  },
};

const recallTool: ExecutableTool = {
  name: "recall",
  description: "Retrieve facts previously stored about a topic.",
  schema: z.object({
    key: z.string().describe("The topic or subject to look up."),
  }),
  async execute({ key }) {
    const facts = store.get(key) ?? [];
    return facts.length === 0
      ? `No facts found for "${key}".`
      : facts.map((f, i) => `${i + 1}. ${f}`).join("\n");
  },
};

const agent = new Agent({
  provider,
  model,
  system:
    "You are a helpful assistant with memory tools. " +
    "Use 'remember' to store important facts and 'recall' to retrieve them later.",
  tools: [rememberTool, recallTool],
});

agent.on((event) => {
  if (event.type === "text:delta") process.stdout.write(event.delta);
});

try {
  // Turn 1: Ask the assistant to remember something
  console.log("[Turn 1] Asking the assistant to remember a fact...\n");
  await agent.send(
    "My cat is named Luna and she's a calico. Remember that."
  ).final;

  // Turn 2: Unrelated
  console.log("\n\n[Turn 2] Unrelated question...\n");
  await agent.send("What's the weather like today?").final;

  // Turn 3: The agent should recall the fact on its own
  console.log("\n\n[Turn 3] Asking about the cat...\n");
  await agent.send("What's my cat's name and what kind of cat is she?").final;

  console.log("\n");
} catch (e) {
  console.error(e);
}

console.log("[Complete]");
```

## Host-directed context

For deterministic host-provided context, retrieve it before sending and
attach it via `Instruct.addContext()`:

```typescript
import { Instruct } from "@fifthrevision/axle";

const relevant = await memoryStore.search({ userId, query: userMessage });
const instruct = new Instruct({ prompt: userMessage }).addContext(
  relevant.map((m) => m.text).join("\n"),
  { title: "Relevant memory" }
);

await agent.send(instruct).final;
```

This keeps memory a host concern — no magic callbacks, no automatic model
injection. See [Instruct](/guide/instruct) for details on `addContext()`.