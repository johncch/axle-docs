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

Only `openrouter` currently remaps model ids and provider tool names; other
vendors pass both through unchanged.

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
| `reasoning` | `boolean` | Enable/disable provider reasoning controls. |
| `maxOutputTokens` | `number` | Output token cap. |
| `temperature` | `number` | Sampling temperature. |
| `topP` | `number` | Nucleus sampling, mapped to provider casing. |
| `stop` | `string \| string[]` | Stop sequences. |
| `toolChoice` | `ToolChoice` | Tool-use constraint. |
| `parallelToolCalls` | `boolean` | Ask the provider to avoid parallel tool calls. |
| `providerOptions` | `Record<string, any>` | Raw fields, applied **after** normalized mappings. |
| `signal` | `AbortSignal` | Aborts the in-flight request. |

```typescript
type ToolChoice = "auto" | "none" | "required" | { type: "tool"; name: string };
```

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

For OpenRouter, `chatCompletions` additionally consults a generated alias table
(`OpenRouterModelAliases`) for models whose OpenRouter slug differs from the
publisher's canonical form — `zai/glm-5.2` → `z-ai/glm-5.2`, and similar casing
fixes. Unknown ids pass through unchanged. Other vendors pass everything through.

## Model catalog

```typescript
import { Models, ModelInfo } from "@fifthrevision/axle/models";

Models.Anthropic.CLAUDE_SONNET_4_5; // "anthropic/claude-sonnet-4-5"

ModelInfo["anthropic/claude-sonnet-4-5"];
// { contextWindow: 200000, maxOutputTokens: 64000, multimodal: true }
```

```typescript
interface ModelMetadata {
  contextWindow?: number;
  maxOutputTokens?: number;
  multimodal: boolean;
}
```

Groups: `Anthropic`, `DeepSeek`, `Google`, `MiniMax`, `Mistral`, `Moonshot`,
`OpenAI`, `Qwen`, `ZAI`. Entries deprecated by their publisher carry a
`@deprecated` tag. The catalog is advisory — any string is a valid model.

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
  createGenerationRequest(model: string, params: ProviderGenerationParams): Promise<ModelResult>;
  createStreamingRequest(model: string, params: ProviderStreamParams): AsyncGenerator<AnyStreamChunk>;
}
```

The request methods are internal, and so are their types:
`ProviderGenerationParams`, `ProviderStreamParams`, `ModelResult`, and
`AnyStreamChunk` are declared by the package but not exported, so you can't name
them from outside.

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
  Error = "error",
  Custom = "custom",
  Cancelled = "cancelled",
}
```

Surfaces as `AxleAssistantMessage.finishReason`.
