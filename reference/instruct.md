---
title: Instruct
description: Constructor options, methods, and rendering rules for Instruct.
---

# Instruct

```typescript
import { Instruct } from "@fifthrevision/axle";

new Instruct<TSchema>(options: InstructOptions<TSchema>)
```

Conceptual guide: [Instruct](/concepts/instruct).

## InstructOptions

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `prompt` | `string` | — | **Required.** Prompt text, may contain <code v-pre>{{variables}}</code>. |
| `schema` | `OutputSchema` (Standard Schema object or JSON Schema) | — | Output schema. Its presence switches `response` to the parsed value. Zod schemas work unchanged; any Standard Schema or plain JSON Schema object works too. |
| `vars` | `"required" \| "optional"` | `"required"` | Whether missing variables throw. |
| `metadata` | `MessageMetadata` | — | Host metadata attached to the compiled message. |

## Properties

| Property | Type |
| --- | --- |
| `prompt` | `string` |
| `schema` | `TSchema` |
| `vars` | `"required" \| "optional"` |
| `inputs` | `InstructInputs` (`Record<string, string \| number \| boolean \| null>`) |
| `files` | `FileInfo[]` |
| `textReferences` | `Array<{ content: string; name?: string }>` |
| `contextSections` | `Array<{ content: string; title?: string }>` |
| `metadata` | `MessageMetadata \| undefined` |

## Inputs

```typescript
withInputs(inputs: InstructInputs): Instruct<TSchema>  // returns a new instance
withInput(name: string, value: InstructInput): Instruct<TSchema>  // returns a new instance
setInputs(inputs: InstructInputs): void               // mutates, replaces all
addInput(name: string, value: InstructInput): void    // mutates, adds one
```

`withInputs` / `withInput` clone first, so the receiver is never modified — this
is what makes an `Instruct` a reusable template.

## Content

```typescript
addFile(file: FileInfo | string, options?: { name?: string }): void
addContext(content: string, options?: { title?: string }): this
hasFiles(): boolean
```

`addFile` routes by kind:

| Input | Becomes |
| --- | --- |
| `string` | A text reference (`## Reference N` section) |
| `FileInfo` with `kind: "text"` and an inline text source | A text reference |
| Any other `FileInfo` | A file part, converted to the provider's native format |

`addContext` returns `this` and is chainable. Context sections perform **no**
variable substitution.

## Lifecycle

```typescript
clone(): Instruct<TSchema>
validate(options?: { vars?: "required" | "optional" }): void
render(options?: { vars?: "required" | "optional" }): string
toMessage(options?: { metadata?: MessageMetadata; id?: string }): AxleUserMessage
parse(final: AxleAssistantMessage | undefined): Promise<InstructResponse<TSchema> | null>
toJSON(): InstructData
fromJSON(data: InstructData): Instruct<JsonSchema>
```

`validate()` throws `AxleInstructVariableError` when `vars` resolves to `"required"`
and inputs are missing, and validates the schema converts to JSON Schema.
`render()` validates first and returns the prompt alone — prompt with variables
filled in, plus `## Reference` and `## Context` sections. It no longer includes
output instructions; the schema travels on the message as `output: { schema }`.

`toMessage()` uses the passed `metadata`, falling back to the instance's.

`parse()` is async and returns `null` for a missing final message; otherwise parses the
message text against the schema, or returns the raw text when there is no
schema.

`toJSON()` serializes the `Instruct` as plain data (the schema as JSON Schema);
`fromJSON()` rebuilds one from it. A revived `Instruct` holds a JSON Schema, so
its answer is parsed as JSON without validation.

## Rendering order

`render()` assembles, in order:

1. **The prompt**, with <code v-pre>{{variables}}</code> substituted.
2. **`## Reference N[: name]`** — one fenced block per text reference.
3. **`## Context N[: title]`** — one fenced block per context section.

Output instructions are not in the stored message. Each request's copy of the
message gets the JSON Schema prepended as output-format instructions ahead of
the prompt. Saved conversations from 0.36 keep the old instructions in their
message text and have no `output`.

Fences auto-widen past any backtick run in the content, so fenced content nests
safely.

## Types

```typescript
type InstructInput = string | number | boolean | null;
type InstructInputs = Record<string, InstructInput>;
type InstructVarsMode = "required" | "optional";
interface InstructRenderOptions { vars?: InstructVarsMode }
interface InstructContextSection { content: string; title?: string }

type OutputSchema = StandardOutputSchema | JsonSchema; // JsonSchema = Record<string, unknown>
type InstructResponse<TSchema> = TSchema extends OutputSchema
  ? ParsedSchema<TSchema>
  : string;

interface InstructData {
  prompt: string;
  inputs?: InstructInputs;
  vars?: InstructVarsMode;
  references?: Array<{ content: string; name?: string }>;
  context?: InstructContextSection[];
  files?: FileInfo[];
  metadata?: MessageMetadata;
  schema?: JsonSchema;
}
```

`parseResponse(text, schema)` is exported separately for parsing a response
outside an `Instruct`. It returns a promise.
