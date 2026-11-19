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

Hand it a schema — a Zod schema (or any Standard Schema), or a plain JSON
Schema object. Axle shows the model the JSON Schema, prepended to your prompt
as output-format instructions, and parses the reply back into a typed value.

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

```typescript
const instruct = new Instruct({
  prompt: "Tell me about Mars.",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      distanceFromSunKm: { type: "number" },
      moons: { type: "array", items: { type: "string" }, description: "Named moons, largest first" },
    },
    required: ["name", "distanceFromSunKm", "moons"],
  },
});
```

A Zod schema works unchanged and `response` keeps its type. `.describe()` on a
field flows into the instructions shown to the model, so it's the cheapest way
to clear up an ambiguous field name. And because the model sees the schema
itself rather than an example object, value constraints like `.min()` and
`.regex()` now reach it — as do schemas that used to throw: `.nullable()`,
unions, tuples, records, `z.email()` and other formats, and non-object roots.
A schema a library can't convert to JSON Schema (such as one with `z.date()`)
throws that library's error. With `.transform()` the model is shown the input
side, and a key with `.default()` is not required.

```typescript
declare const reply: import("@fifthrevision/axle").AxleAssistantMessage | undefined;

const value = await instruct.parse(reply); // Promise — validation may be async
const same = await parseResponse(text, schema);
```

Parsing is async — `Instruct.parse()` and the exported `parseResponse()` return
a promise, since a schema's validator may answer asynchronously. Note the
`await`: code written before 0.37 that reads the value synchronously now holds
a promise instead of the parsed object.

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
`AxleInstructVariableError` at send time and tells you exactly which ones are
missing. Switch to `"optional"` if you want unmatched placeholders left as
literal text:

```typescript
new Instruct({ prompt: "Cost is {{price}}", vars: "optional" });
```

Strings you pass to `agent.send()` are already wrapped with `vars: "optional"`,
so user-typed braces will never blow up a turn.

Inputs are strings, numbers, booleans, or `null` — the values that render the
same on both sides of a remote send. Render anything else yourself before
passing it in, and pass `null` instead of `undefined`:

```typescript
template.withInput("when", new Date().toISOString());
template.withInput("tags", ["a", "b"].join(", "));
template.withInput("count", null);
```

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

The stored message is the prompt — output instructions are no longer part of
it. The message carries the schema as `output: { schema }`, and each request's
copy of the message gets the schema prepended as output-format instructions
(the directive plus the JSON Schema itself, not a field list or an example).
A conversation saved by an earlier Axle keeps the old instructions in its
message text and has no `output`, so it replays as it was.

The final message comes together in this order:

1. Your prompt, with variables filled in
2. `## Reference N` sections, one per text file
3. `## Context N` sections, one per `addContext` call

And you can just look at it:

```typescript
console.log(instruct.render());
```

`render()` returns the prompt alone — no output instructions. (Code that sent
`render()` to a model itself and relied on the instructions now passes the
`Instruct` to `stream()` or `generate()` instead.) Honestly, that's still the
most useful debugging call in the library. When a model does
something baffling, print the message first.

## Reusing an Instruct

`send()` clones whatever you give it, so passing the same object twice is safe
and the two sends can't interfere with each other. Clone explicitly when you want
to fork a template:

```typescript
const base = new Instruct({ prompt: "Answer {{q}}.", schema });
const variant = base.clone();
```

An `Instruct` also round-trips as plain data — what crosses the wire on a
remote send, and what you can persist yourself:

```typescript
const data = instruct.toJSON();
const revived = Instruct.fromJSON(data);
```

A revived `Instruct` holds a JSON Schema, so its answer is parsed as JSON
without validation. See [Remote agents](/concepts/remote-agents).

## Next

- [Tools](/concepts/tools)
- [Results & errors](/concepts/results-and-errors)
- [Instruct reference](/reference/instruct)
