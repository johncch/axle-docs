---
title: Instruct
description: A richer user message — templates, schemas, host context, and attachments.
---

# Instruct

`Instruct` is one user message with more in it than a string. You'll reach for it
when you want any of four things: **structured output**, **template variables**,
**host-supplied context**, or **file attachments**. For plain text, a string
passed to `send()` is still the right answer.

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

const result = await agent.send(instruct).final;
if (result.ok) result.response.keyPoints; // string[]
```

The same object works with [`generate()` and `stream()`](/concepts/generate-and-stream)
if you want a one-shot call without agent-managed history.

## Structured output

Hand it a Zod schema. Axle compiles that into output-format instructions,
prepends them to your message, and parses the model's reply back into a typed
object.

```typescript
const instruct = new Instruct({
  prompt: "Tell me about Mars.",
  schema: z.object({
    name: z.string(),
    distanceFromSunKm: z.number(),
    moons: z.array(z.string()).describe("Named moons, largest first"),
  }),
});
```

`.describe()` on a field flows straight into those generated instructions, so
it's the cheapest way to clear up an ambiguous field name. Axle also builds a
worked example from your schema, which helps more than you'd expect.

If the model returns something unparseable, you get `ok: false` with
`error.kind === "parse"` rather than a throw. See
[Results & errors](/concepts/results-and-errors).

## Template variables

<code v-pre>{{name}}</code> placeholders get filled in from inputs.

```typescript
const template = new Instruct({ prompt: "Translate {{text}} into {{language}}." });

const es = template.withInputs({ text: "hello", language: "Spanish" });
const fr = template.withInput("language", "French").withInput("text", "hello");
```

Notice that `withInputs()` and `withInput()` return **new** instances and leave
the original alone. That's what makes an `Instruct` usable as a reusable
template — build it once, fill it in many times. If you'd rather mutate in place,
`setInputs()` and `addInput()` do that.

By default `vars` is `"required"`, so a missing variable throws
`InstructVariableError` at send time and tells you exactly which ones are
missing. Switch to `"optional"` if you want unmatched placeholders left as
literal text:

```typescript
new Instruct({ prompt: "Cost is {{price}}", vars: "optional" });
```

Strings you pass to `agent.send()` are already wrapped with `vars: "optional"`,
so user-typed braces will never blow up a turn.

## Host context vs. your prompt

`addContext()` appends supporting material your application supplies — a file
manifest, environment details, retrieved records, application state — without
touching the prompt you authored.

```typescript
const instruct = new Instruct({
  prompt: "Review the sandbox and propose the next change.",
});

instruct
  .addContext("src/index.ts\nsrc/server.ts\npackage.json", { title: "Sandbox files" })
  .addContext("Node.js 24\nPackage manager: pnpm", { title: "Environment" });
```

Context sections stay in order, survive `clone()` and `withInputs()`, and
deliberately skip variable substitution — which is the point, since retrieved
content full of `{` characters should stay exactly as it is.

::: warning Worth being clear about
Context sections render into the same final user message as fenced
`## Context N` sections. So `addContext` is a **composition boundary, not a
privilege boundary** — it doesn't give that content different authority in the
model's eyes. If you're passing in content you didn't author, treat it as
untrusted data and say so in your system prompt.
:::

## Files and attachments

```typescript
import { loadFileContent } from "@fifthrevision/axle";

instruct.addFile(await loadFileContent("./chart.png")); // image → native file part
instruct.addFile(await loadFileContent("./report.pdf")); // document → native file part
instruct.addFile("Inline reference text", { name: "notes.txt" }); // → ## Reference section
```

Text becomes a fenced `## Reference N` section in the message body. Images and
documents stay as file parts and get converted to each provider's native format
at request time.

Files can also be URLs, or host-owned deferred references that only resolve when
a request actually needs them — see
[Files, images & PDFs](/cookbook/files-and-images).

## What actually gets sent

The final message comes together in this order:

1. Output-format instructions (only if you set a schema)
2. Your prompt, with variables filled in
3. `## Reference N` sections, one per text file
4. `## Context N` sections, one per `addContext` call

And you can just look at it:

```typescript
console.log(instruct.render());
```

Honestly, that's the most useful debugging call in the library. When a model does
something baffling, print the message first.

## Reusing an Instruct

`send()` clones whatever you give it, so passing the same object twice is safe
and the two sends can't interfere with each other. Clone explicitly when you want
to fork a template:

```typescript
const base = new Instruct({ prompt: "Answer {{q}}.", schema });
const variant = base.clone();
```

## Next

- [Tools](/concepts/tools)
- [Results & errors](/concepts/results-and-errors)
- [Instruct reference](/reference/instruct)
