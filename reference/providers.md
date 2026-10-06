---
title: Providers
description: Provider factories, request options, and the model catalog.
---

# Providers

Conceptual guide: [Providers & models](/concepts/providers).

## Factories

```typescript
import { anthropic, openai, gemini, chatCompletions } from "@fifthrevision/axle";

anthropic(apiKey: string, options?: ProviderClientOptions): AIProvider
openai(apiKey: string, options?: ProviderClientOptions): AIProvider
gemini(apiKey: string, options?: ProviderClientOptions): AIProvider
```

### chatCompletions

Three overloads for any OpenAI-compatible endpoint:

```typescript
chatCompletions(baseUrl: string, options?: ChatCompletionsOptions): AIProvider
chatCompletions(baseUrl: string, apiKey?: string): AIProvider
chatCompletions(baseUrl: string, apiKey: string, options?: Omit<ChatCompletionsOptions, "apiKey">): AIProvider
```

```typescript
interface ChatCompletionsOptions extends ProviderClientOptions {
  apiKey?: string;
  vendor?: ChatCompletionsVendor; // "openrouter" | "together"
}
```

The vendor is inferred from the hostname when omitted:

| Hostname | Vendor |
| --- | --- |
| `openrouter.ai`, `api.openrouter.ai` | `openrouter` |
| `api.together.ai`, `api.together.xyz` | `together` |

Only `openrouter` currently adjusts request behavior; other
vendors pass both through unchanged. Model IDs are never rewritten — pass the
slug the gateway lists.

Provider `name` is `"anthropic"`, `"openai"`, `"gemini"`, or `"ChatCompletions"`.

## ProviderClientOptions

Applied when the client is constructed, not per request.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxRetries` | `number` | `2` | Retries after the first request. `0` disables. Must be ≥ 0. |
| `timeoutMs` | `number` | SDK default | Request timeout. Must be ≥ 1. |

Non-integer or out-of-range values throw at construction.

## AxleModelRequestOptions

Portable per-request options. Settable on `AgentConfig`, on `SendMessageOptions`,
and on `GenerateParams` / `StreamParams`.

| Option | Type | Description |
| --- | --- | --- |
| `reasoning` | `ReasoningSetting` | Portable thinking/reasoning control: `"default"`, `"off"`, `"on"`, or `{ effort: "low" \| "medium" \| "high", display?: "visible" \| "hidden" }`. |
| `maxOutputTokens` | `number` | Output token cap. |
| `toolChoice` | `ToolChoice` | Tool-use constraint. |
| `parallelToolCalls` | `boolean` | Ask the provider to avoid parallel tool calls. |
| `providerOptions` | `Record<string, any>` | Raw fields, applied **after** normalized mappings. |
| `signal` | `AbortSignal` | Aborts the in-flight request. |

`temperature`, `topP`, and `stop` were removed in 0.33.0. Send them through
`providerOptions` using the provider's own field names (`top_p` on Anthropic /
OpenAI / Chat Completions, `topP` on Gemini; `stop_sequences` on Anthropic,
`stopSequences` on Gemini, `stop` on Chat Completions, unsupported on OpenAI).
See [Upgrading](/upgrading).

```typescript
type ToolChoice = "auto" | "none" | "required" | { type: "tool"; name: string };

type ReasoningEffort = "low" | "medium" | "high";
type ReasoningDisplay = "visible" | "hidden";
type ReasoningSetting = "default" | "off" | "on" | { effort: ReasoningEffort; display?: ReasoningDisplay };
```

`display` (default `"visible"`) asks the provider to disclose its thinking
wherever a request field exists. Enabling reasoning (`"on"` or `{ effort }`)
now requests disclosure on Anthropic (`display: "summarized"`), OpenAI
(`summary: "auto"`), and Gemini (`includeThoughts: true`), so Claude and OpenAI
models that streamed no thinking under 0.31 now do. Pass
`{ effort, display: "hidden" }` to keep the 0.31 wire behaviour — the turn
receives no thinking content while the message keeps whatever the wire carried.
Fine-grained values (OpenAI `concise` / `detailed`, Anthropic `updates`) stay in
`providerOptions`; overriding `thinking` on Anthropic replaces the whole object,
`type` included. See [Reasoning models](/cookbook/reasoning#disclosure-vs-form).

Agent-level and send-level options merge shallowly, with send-level winning.
`providerOptions` merges key by key rather than replacing wholesale.

## Model naming

Providers accept plain vendor ids (`"claude-sonnet-4-5"`) and publisher-namespaced
ids (`"anthropic/claude-sonnet-4-5"`). First-party providers strip a matching
prefix and **throw** on a mismatched one:

```typescript
anthropic(key); // model "openai/gpt-5.1" → throws
```

| Provider | Accepted prefixes |
| --- | --- |
| `anthropic()` | `anthropic/` |
| `openai()` | `openai/` |
| `gemini()` | `google/`, `gemini/` |
| `chatCompletions()` | Any — passed through, or remapped by vendor |

Because namespaced ids are also what OpenRouter's API expects, the same model
string works against a first-party provider and an inference gateway without
change. See
[One model string, any inference provider](/concepts/providers#one-model-string-any-inference-provider).

OpenRouter slugs are sent unchanged. If OpenRouter lists a model under a slug
that differs from the publisher's canonical form (casing, or a different author
prefix — `z-ai/glm-5.3`, not `zai/glm-5.3`), pass OpenRouter's slug. IDs that
were already OpenRouter slugs are unaffected.

## Removed in 0.33.0: model catalog

The `@fifthrevision/axle/models` entry point (`Models`, `ModelInfo`,
`ModelMetadata`) no longer exists. Pass model IDs as plain strings; keep your
own table (or ask the provider's models API) when you need context windows or
output ceilings. See [Upgrading](/upgrading).

## Context estimation

```typescript
import { estimateContextUsage } from "@fifthrevision/axle";

estimateContextUsage({
  system?: string;
  tools?: ToolDefinition[];
  mcpTools?: ToolDefinition[];
  providerTools?: ProviderTool[];
  messages: AxleMessage[];
  limit?: number;
}): ContextUsage
```

```typescript
interface ContextUsage {
  total: number;
  system: number;
  tools: number;
  mcpTools: number;
  providerTools: number;
  messages: number;
  limit?: number;
  free?: number; // max(0, limit - total), only when limit is given
}
```

Heuristic and computed locally — not provider-reported. `agent.context()` calls
this with the agent's own state.

## AIProvider

```typescript
interface AIProvider {
  get name(): string;
  resolveProviderToolName?(name: string, model: string): string | undefined;
  createStreamingRequest(model: string, params: ProviderStreamParams): AsyncGenerator<AnyStreamChunk>;
}
```

The request method is internal, and so are its types:
`ProviderStreamParams` and `AnyStreamChunk` are declared by the package but not
exported, so you can't name them from outside. (`createGenerationRequest`,
`ProviderGenerationParams`, and `ModelResult` were removed in 0.32.0 when
`generate()` was unified onto the streaming transport — see
[Upgrading](/upgrading).)

You *can* implement this interface to add your own provider, but it isn't
supported — the chunk and conversion contracts aren't stable across releases, so
expect to keep fixing it.

`resolveProviderToolName` returning `undefined` marks a provider tool as
unsupported, which is what triggers the [web search fallback](/cookbook/web-search).

## AxleStopReason

```typescript
enum AxleStopReason {
  Stop = "stop",
  Length = "length",
  FunctionCall = "function_call",
  Cancelled = "cancelled",
}
```

Surfaces as `AxleAssistantMessage.finishReason`. (`Error` and `Custom` were
removed in 0.33.0 — unknown stop reasons now fail the request. See
[Upgrading](/upgrading).)
