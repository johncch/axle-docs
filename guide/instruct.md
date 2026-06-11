---
title: Instruct
description: Rich messages — structured output, file inputs, templated prompts.
---

# Instruct

`Instruct` is a rich message. Use it when you need structured output, file
attachments, bound template inputs, or additional instructions.

```typescript
import { Instruct } from "@fifthrevision/axle";
import * as z from "zod";

const instruct = new Instruct({
  prompt: "Summarize the following {{topic}}.",
  schema: z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
  }),
}).withInputs({ topic: "document" });

instruct.addFile(await loadFileContent("./report.pdf"));

const result = await agent.send(instruct).final;
if (!result.ok) throw new Error(result.error.kind);
// result.response is { summary: string, keyPoints: string[] }
```

For plain text interactions, pass a string directly to `send()` instead.

## Structured output

Pass a Zod schema to `Instruct`. Axle compiles the schema into output format
instructions, then parses the response back into typed objects.

```typescript
import * as z from "zod";

const instruct = new Instruct({
  prompt: "Tell me about Mars.",
  schema: z.object({
    name: z.string(),
    distanceFromSun: z.number(),
    moons: z.array(z.string()),
  }),
});

const result = await agent.send(instruct).final;
if (!result.ok) throw new Error(result.error.kind);

result.response.name; // string
result.response.distanceFromSun; // number
result.response.moons; // string[]
```

Supported schemas include `z.object`, `z.array`, primitives, `z.enum`, and
`z.literal`. Schema failures surface as a `parse` result error.

For one-shot structured calls without agent-managed history, pass the same
`Instruct` directly to [`generate()`](/guide/low-level) or
[`stream()`](/guide/low-level).

## Template variables

Use `{{variable}}` syntax in `prompt`, then bind values with `withInput` or
`withInputs`.

```typescript
const summarize = new Instruct({
  prompt: "Summarize this {{kind}} for a {{audience}} reader.",
});

const a = summarize.withInputs({ kind: "report", audience: "technical" });
const b = summarize.withInputs({ kind: "memo", audience: "general" });
```

Missing required variables are reported as clear errors at render time. Use
`.clone()` to copy an `Instruct` if you want to bind inputs without mutating
the original.

## Host-supplied context

Use `addContext(content, options?)` to append supporting material without
modifying the authored prompt. Context sections are ordered, survive
`clone()`/`withInputs()`, and become part of the final user message after text
references.

```typescript
const instruct = new Instruct({
  prompt: "Inspect the current sandbox and suggest the next change.",
});

instruct.addContext("src/index.ts\npackage.json", {
  title: "Sandbox files",
});
instruct.addContext("Node.js 24\nPackage manager: pnpm", {
  title: "Environment",
});
```

Context sections:
- Do not perform `{{variable}}` substitution
- Render in insertion order after text references
- Use collision-safe Markdown fences (automatically sized to avoid fence bleed)

This is ideal for manifests, environment details, retrieved context, or other
host-owned material that should travel with the prompt but not be mistaken for
user-authored instructions.

## File attachments

```typescript
import { loadFileContent } from "@fifthrevision/axle";

instruct.addFile(await loadFileContent("./report.pdf"));
```

Axle handles MIME detection and routes the file through whichever shape the
target provider accepts. Multi-modal output is not currently supported.

## User turn metadata

Pass `metadata` to attach stable, host-owned render data to the user message.
Providers ignore it; Axle stores it in history and copies it onto the
corresponding user `Turn`.

```typescript
const instruct = new Instruct({
  prompt: "Review this prompt",
  metadata: { surface: "prompt-review" },
});
```

Use metadata for stable facts about the message origin (surface, source,
experiment ID). Use annotations for mutable, async, or explicitly placed UI
state.

## Vars mode

`Instruct` supports a vars-only mode for variable-driven prompting (added in
0.16.3). See the [Changelog](/changelog) for details.
