---
title: stream() with Instruct
description: Streamed structured output, with prior context passed as messages.
---

# stream() with Instruct

When you pass both `messages` and `instruct` to `stream()`, the messages are
treated as prior context and the rendered `Instruct` is appended as the new
user turn. Combined with a schema, this lets you stream a typed response
that respects an existing conversation.

Source: [`examples/scripts/simple-stream-instruct.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-stream-instruct.ts)

```typescript
import z from "zod";
import { Instruct, stream, anthropic } from "@fifthrevision/axle";
import type { AxleMessage } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const messages: AxleMessage[] = [
  {
    role: "user",
    content: "We are comparing TypeScript, Rust, and Python for small backend services.",
  },
  {
    role: "assistant",
    id: "prior-summary",
    content: [
      {
        type: "text",
        text: "TypeScript is familiar for web teams, Rust emphasizes performance and safety, and Python is strong for quick iteration.",
      },
    ],
  },
];

const instruct = new Instruct({
  prompt: "Using the prior context, choose the best default language and explain why.",
  schema: z.object({
    choice: z.string(),
    reason: z.string(),
  }),
});

console.log("[Starting...]");

try {
  const handle = stream({
    provider,
    model,
    messages,
    instruct,
  });

  handle.on((event) => {
    switch (event.type) {
      case "text:delta":
        process.stdout.write(event.delta);
        break;
      case "error":
        console.error(`[Error] ${JSON.stringify(event.error, null, 2)}`);
        break;
    }
  });

  const result = await handle.final;

  console.log();
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
