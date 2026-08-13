---
title: Transcript & persistence
description: Attach a Transcript to the event stream and persist turns alongside the session.
---

# Transcript & persistence

The agent no longer owns a transcript — turns are host-owned. Attach a
`Transcript` to the event stream, persist its `turns` next to the session,
and re-seed it on restore.

```typescript
import {
  Agent,
  Transcript,
  anthropic,
  createAgentConfig,
} from "@fifthrevision/axle";
import type { AgentDefinition, SavedAgent, Turn } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

// A serializable definition for your database
const definition: AgentDefinition = {
  version: 1,
  name: "my-agent",
  provider: { type: "anthropic" },
  model,
  system: "You are a helpful assistant.",
};

async function run() {
  // --- First session: create, run, persist ---
  const config = await createAgentConfig(definition, async () => ({ provider }));
  const agent = new Agent(config);

  // Attach a transcript to the event stream
  const transcript = new Transcript();
  agent.on((event) => transcript.apply(event));

  // Stream text as it arrives
  agent.on((event) => {
    if (event.type === "text:delta") process.stdout.write(event.delta);
  });

  console.log("[Turn 1]\n");
  let result = await agent.send("Hi, my name is Ana.").final;
  if (!result.ok) throw new Error(result.error.kind);

  console.log("\n\n[Turn 2]\n");
  result = await agent.send("What's my name?").final;
  if (!result.ok) throw new Error(result.error.kind);

  // Persist session + turns for later
  const saved: SavedAgent = {
    definition,
    session: await agent.snapshot(), // { sessionId, messages }
  };
  const turns: readonly Turn[] = transcript.turns;

  console.log(`\n[Saved] ${turns.length} turns, session: ${saved.session.sessionId}`);

  // --- Later: restore and continue ---
  const restoredConfig = await createAgentConfig(saved.definition, async () => ({ provider }));
  const restoredAgent = new Agent(restoredConfig, saved.session);

  // Re-seed the transcript
  const restoredTranscript = new Transcript(turns as Turn[]);
  restoredAgent.on((event) => restoredTranscript.apply(event));

  // Stream text on the restored agent too
  restoredAgent.on((event) => {
    if (event.type === "text:delta") process.stdout.write(event.delta);
  });

  console.log("\n[Turn 3 — restored]\n");
  result = await restoredAgent.send("What's my name again?").final;
  if (!result.ok) throw new Error(result.error.kind);

  console.log(
    `\n\n[Total turns: ${restoredTranscript.turns.length}]`
  );
}

run().catch(console.error);
```

## Key points

- **`agent.messages`** is the active model-facing conversation. There is no
  `agent.history`.
- **`Transcript`** folds the event stream into renderable `Turn[]` — use
  `transcript.turns` for persistence and rendering.
- **`agent.snapshot()`** returns `{ sessionId, messages }`. Persist turns
  separately; the agent cannot recreate them.
- **Re-seed on restore:** `new Transcript(savedTurns)`, then attach to the
  new agent's event stream.

For model-directed memory, provide ordinary retrieval and writing tools in
`AgentConfig.tools`. For host-directed context, retrieve it before sending
and attach it via `Instruct.addContext()`. See [Agent](/guide/agent) and
[Instruct](/guide/instruct) for details.