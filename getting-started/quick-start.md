---
title: Quick Start
description: Send your first message with Axle in under a minute.
---

# Quick Start

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY);
const agent = new Agent({ provider, model: "claude-sonnet-4-5-20250929" });

const r1 = await agent.send("What is the capital of France?").final;
if (!r1.ok) throw new Error(r1.error.kind);
console.log(r1.response); // "Paris is the capital of France."

// Multi-turn — history is managed automatically
const r2 = await agent.send("And what about Germany?").final;
if (!r2.ok) throw new Error(r2.error.kind);
```

That's the whole flow:

1. Pick a provider — `anthropic`, `openai`, `gemini`, or `chatCompletions` for
   any OpenAI-compatible endpoint.
2. Create an `Agent` and call `send()` with either a plain string or an
   [`Instruct`](/guide/instruct).
3. Read `result.response` once you've checked `result.ok`.

## What to read next

- [Agent](/guide/agent) — the primary interface and its options
- [Instruct](/guide/instruct) — structured output, files, templated prompts
- [Tools](/guide/tools) — give the agent functions it can call
- [Streaming](/guide/streaming) — receive output as it arrives
