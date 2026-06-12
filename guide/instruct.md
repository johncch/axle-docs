---
title: Instruct
description: Rich messages — structured output, file inputs, templated prompts, and host-supplied context.
---

# Instruct

`Instruct` is a rich message. Use it when you need structured output, file
attachments, bound template inputs, additional instructions, or host-supplied
supporting context.

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

instruct.addContext("Files available: report.pdf", {
  title: "Sandbox manifest",
});
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

## Supporting context

Use `addContext` for host-supplied information that should remain separate from
the user-authored prompt until final rendering. Typical examples include a
sandbox file manifest, environment details, or retrieved records:

```typescript
const instruct = new Instruct({
  prompt: "Review the sandbox and propose the next change.",
});

instruct
  .addContext("src/index.ts\nsrc/server.ts\npackage.json", {
    title: "Sandbox files",
  })
  .addContext("Node.js 24\nPackage manager: pnpm", {
    title: "Environment",
  });
```

Context sections are ordered, survive `clone()`/`withInputs()`, and do not
perform `{{variable}}` substitution. They become part of the same final
user-message text as the prompt — `addContext` provides composition and
ownership semantics, not a separate model instruction priority.

Text references and context sections are rendered inside a collision-safe
Markdown fence. The fence avoids accidental closure by embedded triple-backtick
code blocks.

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