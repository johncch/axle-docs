---
title: Structured output (schema)
description: Use a Zod schema to get a typed object back from the model.
---

# Structured output

Pass a Zod schema to `Instruct` and Axle will compile output-format
instructions for the model and parse the response back into a typed object.

Source: [`examples/scripts/simple-schema.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-schema.ts)

```typescript
import * as z from "zod";
import { Agent, Instruct, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const instruct = new Instruct({
  prompt: "Tell me about the planet Mars.",
  schema: z.object({
    name: z.string(),
    distanceFromSun: z.number(),
    moons: z.array(z.string()),
    habitability: z.string(),
  }),
});

const agent = new Agent({ provider, model });
const result = await agent.send(instruct).final;

console.log("Parsed response:", result.response);
console.log(`Usage: in=${result.usage.in}, out=${result.usage.out}`);
```
