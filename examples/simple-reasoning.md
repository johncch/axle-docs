---
title: Reasoning / thinking
description: Enable reasoning mode and stream the model's thinking separately from its response.
---

# Reasoning

Set `reasoning: true` on the agent and listen for `thinking:*` events to
print the model's reasoning steps as they arrive, then the final answer.

Source: [`examples/scripts/simple-reasoning.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-reasoning.ts)

```typescript
import { Agent, Instruct, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

async function reasonIt() {
  const agent = new Agent({ provider, model, reasoning: true });

  agent.on((event) => {
    if (event.type === "part:start" && event.part.type === "thinking") {
      process.stdout.write("--- thinking ---\n");
    }
    if (event.type === "thinking:delta") {
      process.stdout.write(event.delta);
    }
    if (event.type === "thinking:summary-delta") {
      process.stdout.write(event.delta);
    }
    if (event.type === "part:start" && event.part.type === "text") {
      process.stdout.write("\n\n--- response ---\n");
    }
    if (event.type === "text:delta") {
      process.stdout.write(event.delta);
    }
  });

  const instruct = new Instruct({
    prompt: "If x + y = 10 and xy = 21, what are x and y? Show your reasoning step by step.",
  });

  await agent.send(instruct).final;
  process.stdout.write("\n");
}

reasonIt();
```

## Rendering thinking parts

Thinking parts now carry one of three representations depending on the
provider. Discriminate on the available fields:

```typescript
agent.on((event) => {
  if (event.type === "part:start" && event.part.type === "thinking") {
    const part = event.part;

    if (part.redacted) {
      // Provider redacted the reasoning — show a placeholder
      process.stdout.write("[thinking redacted]\n");
    } else if (part.summary !== undefined) {
      // Provider supplies a summary (streamed via thinking:summary-delta)
      process.stdout.write("--- thinking summary ---\n");
    } else {
      // Full thinking text (streamed via thinking:delta)
      process.stdout.write("--- thinking ---\n");
    }
  }

  if (event.type === "thinking:delta") {
    process.stdout.write(event.delta);
  }

  if (event.type === "thinking:summary-delta") {
    process.stdout.write(event.delta);
  }
});
```

See [Streaming](/guide/streaming) for the full event list.
