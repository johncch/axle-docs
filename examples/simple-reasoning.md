---
title: Reasoning / thinking
description: Enable reasoning mode and stream the model's thinking separately from its response.
---

# Reasoning

Set `reasoning: true` on the agent and listen for `thinking:*` events to
print the model's reasoning steps as they arrive, then the final answer.

In 0.21.0, `ThinkingPart.text` is optional — not every provider exposes raw
thinking text. Some providers return a summary via `thinking:summary-delta`;
others redact the thinking block entirely. Check the part flags before
rendering.

Source: [`examples/scripts/simple-reasoning.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-reasoning.ts)

```typescript
import { Agent, Instruct, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

async function reasonIt() {
  const agent = new Agent({ provider, model, reasoning: true });

  agent.on((event) => {
    switch (event.type) {
      case "part:start":
        if (event.part.type === "thinking") {
          if (event.part.redacted) {
            process.stdout.write("--- thinking (redacted) ---\n");
          } else {
            process.stdout.write("--- thinking ---\n");
          }
        }
        if (event.part.type === "text") {
          process.stdout.write("\n\n--- response ---\n");
        }
        break;
      case "thinking:delta":
        // Raw thinking text from the provider
        process.stdout.write(event.delta);
        break;
      case "thinking:summary-delta":
        // Provider-supplied summary (e.g. some OpenAI or Gemini modes)
        process.stdout.write(event.delta);
        break;
      case "text:delta":
        process.stdout.write(event.delta);
        break;
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

## Handling all thinking shapes

Different providers surface reasoning in different ways. A complete handler
covers all three cases:

```typescript
agent.on((event) => {
  if (event.type === "part:start" && event.part.type === "thinking") {
    if (event.part.redacted) {
      renderThinkingPlaceholder();
    } else if (event.part.summary) {
      renderThinkingSummary(event.part.summary);
    } else if (event.part.text) {
      renderThinkingText(event.part.text);
    }
  }
});
```

See [Streaming](/guide/streaming) for the full event list, including
`thinking:update` (for redaction and continuity payloads).
