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
| `tools` | `AnyTool[]` | Executable and deferred tools. |
| `providerTools` | `ProviderTool[]` | Provider-managed tools. |
| `onToolCall` | `ToolCallCallback` | Answers calls to the deferred tools in `tools`. Executable tools never reach it. |
| `maxSteps` | `number` | Cap on model requests. Must be ≥ 1. |
| `maxContextTokens` | `number` | Context budget in tokens. Must be ≥ 1. |
| `streamStallMs` | `number` | Longest gap in milliseconds between two chunks from the provider on one step's stream, the wait for the first included. When it passes, the request aborts and the run ends `ok: false` with `{ kind: "api", type: "StreamStall" }`; nothing is retried. Unset by default. Must exceed a reasoning model's silent thinking. |
| `span` | `Span` | Parent tracing span. |
| `fileResolver` | `FileResolver` | Resolves deferred file references. |
| `sessionId` | `string` | Conversation identity forwarded to the provider on every step. Only OpenRouter uses it today (as `session_id`, for sticky routing, cache affinity, and dashboard grouping); other providers ignore it. `Agent` passes its own `sessionId`; a call without one gets a fresh id so the steps of its own tool loop stay together. Pass the same id to separate calls to share OpenRouter cache reads across them. |
| ...request options | | See [Providers](/reference/providers#axlemodelrequestoptions). |

Non-positive limits throw with code `INVALID_OPTIONS`.

(`StreamParams.registry` was removed in 0.34.0 — the loop builds every request
from the `tools` and `providerTools` it was given and never reads a registry,
so a tool added to a `ToolRegistry` mid-loop no longer appears. See
[Upgrading](/upgrading).)

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
import type { DeferredCall, ToolCallCallback, ToolContext } from "@fifthrevision/axle";
import type { ToolResultPart } from "@fifthrevision/axle";

type ToolCallCallback = (
  call: DeferredCall,
  ctx: ToolContext,
) => string | ToolResultPart[] | void | Promise<string | ToolResultPart[] | void>;
```

Answers calls to the deferred tools in `tools`. The call arrives with its
arguments already validated against the tool's schema (`{ id, name, input }`);
the handler returns what an `execute` would, throws to hand the model an
`execution` error result, and returns nothing for a call it does not answer —
which stays waiting for `toolCall(id)`, the tool's `timeout`, or cancellation.
Executable tools never reach the handler; the call's arguments are validated
before the handler runs, and a mismatch returns a `validation` error tool
result without calling it. `generate()` has no handle, so a call the handler
does not answer — or any call when there is no handler — fails at once with an
`execution` error naming the tool.

## Handles

```typescript
interface StreamHandle {
  on(callback: (event: StreamEvent) => void): void;
  onToolBatchComplete(callback: ToolBatchCompleteCallback): void;
  cancel(reason?: unknown): void;
  toolCall(id: string): WaitingToolCall | undefined;
  readonly final: Promise<StreamResult>;
}

type ToolBatchCompleteCallback = (
  message: AxleToolCallMessage,
) => ToolBatchDecision | Promise<ToolBatchDecision>;

/**
 * What the tool-batch boundary decides: `"finish"` ends the loop without
 * another request; `"continue"` sends the next one as is; an object continues
 * with that prompt and those tools replacing the current ones, exactly as the
 * initial call set them. (The object form was added in 0.34.0.)
 */
type ToolBatchDecision =
  | "continue"
  | "finish"
  | Pick<StreamParams, "system" | "tools" | "providerTools">;
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
      error: AxleProviderFailure;
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
| `thinking:start` | `continuity?` (Anthropic: only once a signature or redacted data has arrived), `providerMetadata?` |
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
| `tool:request` | `id`, `name`, `kind?` (`"tool"` \| `"agent"` \| `"deferred"`) |
| `tool:args-delta` | `id`, `name`, `delta`, `accumulated` |
| `tool:exec-start` | `id`, `name`, `parameters` — never fires for deferred calls |
| `tool:waiting` | `id`, `name`, `input` — the validated deferred call, handed to `onToolCall`; answer it or wait for `toolCall(id)` |
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
| `error` | `error: AxleProviderFailure` |

`provider-tool:input` (added in 0.33.0) fires when the provider says what the
tool was asked to do — before the search runs on Anthropic, together with the
result on OpenAI. `provider-tool:error` replaces `complete` when the provider
reports failure; a consumer that waits for `complete` to close a provider tool
must handle `error` as well. On `complete`, `output` carries the tool's printed
output when the provider reports one stream (code execution); search results
live on the finished message part's `continuity`, not on the event. See
[Messages & parts](/reference/messages#providertool-parts).
