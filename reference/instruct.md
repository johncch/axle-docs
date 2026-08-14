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
| `schema` | `OutputSchema` (`z.ZodTypeAny`) | — | Output schema. Its presence switches `response` to the parsed value. Objects are the common case, but any Zod type works. |
| `vars` | `"required" \| "optional"` | `"required"` | Whether missing variables throw. |
| `metadata` | `MessageMetadata` | — | Host metadata attached to the compiled message. |

## Properties

| Property | Type |
| --- | --- |
| `prompt` | `string` |
| `schema` | `TSchema` |
| `vars` | `"required" \| "optional"` |
| `inputs` | `Record<string, unknown>` |
| `files` | `FileInfo[]` |
| `textReferences` | `Array<{ content: string; name?: string }>` |
| `contextSections` | `Array<{ content: string; title?: string }>` |
| `metadata` | `MessageMetadata \| undefined` |

## Inputs

```typescript
withInputs(inputs: Record<string, unknown>): Instruct<TSchema>  // returns a new instance
withInput(name: string, value: unknown): Instruct<TSchema>      // returns a new instance
setInputs(inputs: Record<string, unknown>): void                // mutates, replaces all
addInput(name: string, value: unknown): void                    // mutates, adds one
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
toMessage(options?: { metadata?: MessageMetadata }): AxleUserMessage
parse(final: AxleAssistantMessage | undefined): InstructResponse<TSchema> | null
```

`validate()` throws `InstructVariableError` when `vars` resolves to `"required"`
and inputs are missing, and validates the schema is convertible to an example.
`render()` validates first.

`toMessage()` uses the passed `metadata`, falling back to the instance's.

`parse()` returns `null` for a missing final message; otherwise parses the
message text against the schema, or returns the raw text when there is no
schema.

## Rendering order

`render()` assembles, in order:

1. **Output-format instructions** — only when `schema` is set. Contains the
   directive to return bare JSON, one bullet per field description derived from
   the schema, and a JSON example.
2. **The prompt**, with <code v-pre>{{variables}}</code> substituted.
3. **`## Reference N[: name]`** — one fenced block per text reference.
4. **`## Context N[: title]`** — one fenced block per context section.

Fences auto-widen past any backtick run in the content, so fenced content nests
safely.

## Types

```typescript
type InstructInputs = Record<string, unknown>;
type InstructVarsMode = "required" | "optional";
interface InstructRenderOptions { vars?: InstructVarsMode }
interface InstructContextSection { content: string; title?: string }

type InstructResponse<TSchema> = TSchema extends OutputSchema
  ? ParsedSchema<TSchema>
  : string;
```

`parseResponse(text, schema)` is exported separately for parsing a response
outside an `Instruct`.
