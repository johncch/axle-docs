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

`generate(o)` is `stream(o).final` — the same request, the same tool loop, and
the same result, resolved as a promise instead of a handle. (Unified onto the
streaming transport in 0.32.0; there is no non-streaming request anymore.)

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
| `sessionId` | `string` | Conversation identity forwarded to the provider. Only OpenRouter uses it today (as `session_id`, for sticky routing and dashboard grouping); other providers ignore it. `Agent` passes its own `sessionId`. |
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
| `thinking:start` | `continuity?`, `providerMetadata?` |
| `thinking:raw-delta` | `delta`, `accumulated` |
| `thinking:summary-delta` | `delta`, `accumulated` |
| `thinking:update` | `continuity?`, `providerMetadata?` |
| `thinking:end` | `summary?`, `raw?` — each present only if a delta wrote it |

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
| `provider-tool:start` | `id`, `name` — `name` is Axle's portable name |
| `provider-tool:input` | `id`, `name`, `input` — what the tool was asked to do |
| `provider-tool:complete` | `id`, `name`, `output?` — the tool's printed output when the provider reports one stream |
| `provider-tool:error` | `id`, `name`, `error: { type, message }` — the provider reported failure |
| `error` | `error: AxleFailure` |

`provider-tool:input` (added in 0.33.0) fires when the provider says what the
tool was asked to do — before the search runs on Anthropic, together with the
result on OpenAI. `provider-tool:error` replaces `complete` when the provider
reports failure; a consumer that waits for `complete` to close a provider tool
must handle `error` as well. On `complete`, `output` carries the tool's printed
output when the provider reports one stream (code execution); search results
live on the finished message part's `continuity`, not on the event. See
[Messages & parts](/reference/messages#providertool-parts).

## Removed in 0.32.0: generateStep()

```typescript
// @check-skip — removed in 0.32.0, kept here so the name resolves
generateStep(params): Promise<ModelResult>
```

`generateStep()` performed exactly one provider request — no loop, no tool
execution. It no longer exists: there is no non-streaming request to make.
Call `stream()` with `maxSteps: 1` and read `final`, or `generate()` with the
same option. Custom providers implement `createStreamingRequest` only.
