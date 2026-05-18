---
title: generate() with Instruct
description: One-shot structured output without conversation state.
---

# generate() with Instruct

Pass an `Instruct` (with a schema) directly to `generate()` to get a parsed
typed object back — no `Agent`, no history.

Source: [`examples/scripts/simple-generate-instruct.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-generate-instruct.ts)

```typescript
import z from "zod";
import { generate, Instruct, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const instruct = new Instruct({
  prompt: "Name three planets and return a short note about the list.",
  schema: z.object({
    planets: z.array(z.string()),
    note: z.string(),
  }),
});

console.log("[Starting...]");

try {
  const result = await generate({
    provider,
    model,
    instruct,
  });

  if (!result.ok) {
    console.log(JSON.stringify(result.error, null, 2));
  } else {
    console.log("Parsed response:", result.response);
    console.log(`Usage: in=${result.usage?.in ?? 0}, out=${result.usage?.out ?? 0}`);
  }
} catch (e) {
  console.error(e);
}

console.log("[Complete]");
```
