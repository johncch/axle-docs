---
title: Reasoning / thinking
description: Enable reasoning mode and stream the model's thinking separately from its response.
---

# Reasoning

Set `reasoning: true` on the agent and listen for `thinking:*` events to
print the model's reasoning steps as they arrive, then the final answer.

As of 0.21.0, `ThinkingPart.text` is optional and providers may supply a
`summary` instead of (or in addition to) raw text. `thinking:delta` carries
incremental raw text; `thinking:summary-delta` carries incremental summary
text. The example below handles both.

Source: [`examples/scripts/simple-reasoning.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-reasoning.ts)

```typescript
import { Agent, Instruct, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

async function reasonIt() {
  const agent = new Agent({ provider, model, reasoning: true });

  agent.on((event) => {
    if (event.type === "part:start" && event.part.type === "thinking") {
      if (event.part.redacted) {
        process.stdout.write("--- thinking (redacted) ---\n");
      } else {
        process.stdout.write("--- thinking ---\n");
      }
    }
    // Raw reasoning text (Anthropic, OpenAI)
    if (event.type === "thinking:delta") {
      process.stdout.write(event.delta);
    }
    // Provider-supplied reasoning summary (e.g. Gemini flash thinking)
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

See [Streaming](/guide/streaming) for the full `thinking` part shape and the
complete list of thinking-related events.
