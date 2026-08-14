---
title: generate() & stream()
description: Parameters, handles, results, and the full StreamEvent union.
---

# generate() & stream()

Conceptual guide: [generate() & stream()](/concepts/generate-and-stream).

## generate()

```typescript
generate(options: GenerateParams): Promise<GenerateResult>
generate<TSchema>(options: GenerateInstructParams<TSchema>): Promise<GenerateInstructResult<TSchema>>
```

## stream()

```typescript
stream(options: StreamParams): StreamHandle
stream<TSchema>(options: StreamInstructParams<TSchema>): StreamInstructHandle<TSchema>
```

Processing begins on the next microtask, so callbacks registered synchronously
after the call receive every event.

## Parameters

`GenerateParams` and `StreamParams` are identical apart from their return type.
Both extend `AxleModelRequestOptions`.

| Option | Type | Description |
| --- | --- | --- |
| `provider` | `AIProvider` | **Required.** |
| `model` | `string` | **Required.** |
| `messages` | `AxleMessage[]` | **Required** (optional with `instruct`). |
| `system` | `string` | System instruction. |
| `tools` | `ExecutableTool[]` | Local tools. Mutually exclusive with `registry`. |
| `providerTools` | `ProviderTool[]` | Provider-managed tools. Mutually exclusive with `registry`. |
| `registry` | `ToolRegistry` | Prebuilt registry. Mutually exclusive with `tools`/`providerTools`. |
| `onToolCall` | `ToolCallCallback` | Intercepts tool calls before the registry. |
| `maxSteps` | `number` | Cap on model requests. Must be ≥ 1. |
| `maxContextTokens` | `number` | Context budget in tokens. Must be ≥ 1. |
| `span` | `Span` | Parent tracing span. |
| `fileResolver` | `FileResolver` | Resolves deferred file references. |
| ...request options | | See [Providers](/reference/providers#axlemodelrequestoptions). |

Passing both `registry` and `tools`/`providerTools` throws `AxleError` with code
`TOOL_OPTIONS_CONFLICT`. Non-positive limits throw with code `INVALID_OPTIONS`.

### Instruct variants

```typescript
interface GenerateInstructParams<TSchema extends OutputSchema | undefined>
  extends Omit<GenerateParams, "messages"> {
  messages?: AxleMessage[]; // prior context
  instruct: Instruct<TSchema>;
}
```

The `Instruct` is cloned, rendered, and appended after `messages`. `response`
becomes the parsed value instead of a message.

### onToolCall

```typescript
type ToolCallCallback = (
  name: string,
  parameters: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolCallResult | null | undefined>;

type ToolCallResult =
  | { type: "success"; content: string | ToolResultPart[] }
  | { type: "error"; error: { type: string; message: string; fatal?: boolean; retryable?: boolean } };
```

Runs **before** the registry. Returning `null` or `undefined` falls through to a
registered tool of that name; if there is none, the call fails.

::: warning These two types are not exported
`ToolCallCallback` and `ToolCallResult` are declared by the package but not
exported, so you can't annotate your handler with them. Write the callback
inline — it's contextually typed from `GenerateParams` / `StreamParams` — or
copy the shape above.
:::

## Handles

```typescript
interface StreamHandle {
  on(callback: (event: StreamEvent) => void): void;
  onToolBatchComplete(callback: ToolBatchCompleteCallback): void;
  cancel(reason?: unknown): void;
  readonly final: Promise<StreamResult>;
}

type ToolBatchCompleteCallback = (
  message: AxleToolCallMessage,
) => "continue" | "finish" | Promise<"continue" | "finish">;
```

`StreamInstructHandle<TSchema>` is the same with `final: Promise<StreamInstructResult<TSchema>>`.

Unlike `agent.on()`, `stream().on()` does not return an unsubscribe function.

## Results

```typescript
type GenerateResult<TResponse = AxleAssistantMessage> =
  | {
      ok: true;
      response: TResponse;
      messages: AxleMessage[];
      final: AxleAssistantMessage;
      error?: undefined;
      usage?: Stats;
      stopped?: "max-steps" | "token-limit";
    }
  | {
      ok: false;
      response?: undefined;
      final?: AxleAssistantMessage;
      messages: AxleMessage[];
      error: AxleFailure;
      usage?: Stats;
      stopped?: "max-steps" | "token-limit";
    };

type StreamResult<TResponse = AxleAssistantMessage> = GenerateResult<TResponse>;
```

`stopped` on a success means a limit ended the loop; the conversation is
well-formed and continuable, and `final.finishReason` keeps the provider's own
reason. `stopped` on a `parse` error means the limit landed before parseable
output existed.

## StreamEvent

### Step and batch boundaries

| Event | Fields |
| --- | --- |
| `step:start` | `id`, `model` |
| `step:complete` | `message`, `usage?` |
| `tool-results:start` | `id` |
| `tool-results:complete` | `message` |

### Text

| Event | Fields |
| --- | --- |
| `text:start` | — |
| `text:delta` | `delta`, `accumulated` |
| `text:citation` | `citation`, `citations` |
| `text:end` | `final` |
| `citation` | `citations`, `providerMetadata?` — unanchored source list |

### Thinking

| Event | Fields |
| --- | --- |
| `thinking:start` | `redacted?`, `continuity?`, `providerMetadata?` |
| `thinking:delta` | `delta`, `accumulated` |
| `thinking:summary-delta` | `delta`, `accumulated` |
| `thinking:update` | `redacted?`, `continuity?`, `providerMetadata?` |
| `thinking:end` | `final` |

Text and thinking parts stream sequentially; a delta belongs to the most recently
opened part of its kind.

### Tools

Correlated by `id`.

| Event | Fields |
| --- | --- |
| `tool:request` | `id`, `name`, `kind?` (`"tool"` \| `"agent"`) |
| `tool:args-delta` | `id`, `name`, `delta`, `accumulated` |
| `tool:exec-start` | `id`, `name`, `parameters` |
| `tool:exec-delta` | `id`, `name`, `chunk` |
| `tool:exec-complete` | `id`, `name`, `result`, `usage?` |
| `tool:exec-error` | `id`, `name`, `error: { type: "fatal" \| "aborted"; message }`, `usage?` |

### Provider tools and errors

| Event | Fields |
| --- | --- |
| `provider-tool:start` | `id`, `name` |
| `provider-tool:complete` | `id`, `name`, `output?` |
| `error` | `error: AxleFailure` |

## generateStep()

```typescript
generateStep(params): Promise<ModelResult>
```

One provider request. No loop, no tool execution. Takes `provider`, `model`,
`messages`, `system?`, `tools?` (as `ToolDefinition[]`), `providerTools?`,
`span?`, `fileResolver?`, plus request options.

```typescript
type ModelResult = ModelResponse | ModelError;

interface ModelResponse {
  type: "success";
  role: "assistant";
  id: string;
  model: string;
  text: string;
  content: Array<ContentPartText | ContentPartThinking | ContentPartToolCall | ContentPartCitation>;
  finishReason: AxleStopReason;
  usage: Stats;
  raw: any;
}

interface ModelError {
  type: "error";
  error: { type: string; message: string };
  usage?: Stats;
  raw?: any;
}
```
