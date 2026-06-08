---
title: generate()
description: One-shot generation with a tool and an onToolCall handler.
---

# generate()

`generate()` is the non-streaming primitive — it returns the final result as
a promise. Pass `messages`, `tools`, and an `onToolCall` callback; Axle
drives the tool loop until the model produces a final response.

Source: [`examples/scripts/simple-generate.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-generate.ts)

```typescript
import z from "zod";
import { generate, anthropic } from "@fifthrevision/axle";
import type { ExecutableTool } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const setNameTool: ExecutableTool<z.ZodObject<{ name: z.ZodString }>> = {
  name: "setName",
  description: "Set your name in the app",
  schema: z.object({
    name: z.string().describe("The name to call yourself"),
  }),
  async execute() {
    return "success";
  },
};

const result = await generate({
  provider,
  model,
  messages: [
    {
      role: "user",
      content:
        "Tell me a 3-sentence story with a character's name, then call setName with that name.",
    },
  ],
  tools: [setNameTool],
  onToolCall: async (name, parameters) => {
    console.log(`[tool] ${name} ${JSON.stringify(parameters)}`);
    return { type: "success", content: "success" };
  },
});

if (!result.ok) throw new Error(result.error.kind);
console.log(result.response);
```

::: tip
The script in the repo also wires up a `Tracer` with `SimpleWriter` for
human-readable logs. Create a tracer, start a span, and pass it as `span`:

```typescript
import { Tracer, SimpleWriter } from "@fifthrevision/axle";

const tracer = new Tracer({ writers: [new SimpleWriter()] });
// then on the call:
//   span: tracer.startSpan("generate")
```

The same pattern works for `stream()`.
:::
