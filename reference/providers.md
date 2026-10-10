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
  vendor?: ChatCompletionsVendor; // "openrouter" | "togetherai"
  webSearch?: ExecutableTool; // serves `web_search` requests on this provider
}
```

The vendor is inferred from the hostname when omitted (see
`inferChatCompletionsVendor`, exported for hosts that need the same answer):

| Hostname | Vendor |
| --- | --- |
| `openrouter.ai`, `api.openrouter.ai` | `openrouter` |
| `api.together.ai`, `api.together.xyz` | `togetherai` |

Only `openrouter` currently adjusts request behavior; other
vendors pass both through unchanged. Model IDs are never rewritten — pass the
slug the gateway lists.

`vendor: "together"` became `"togetherai"` in 0.34.0, matching the id models.dev
uses. Only an explicit `vendor` needs editing; the Together hostnames are still
recognized without it. See [Upgrading](/upgrading).

### webSearch

```typescript
import { chatCompletions, braveWebSearch } from "@fifthrevision/axle";

const provider = chatCompletions("https://api.together.ai/v1", {
  apiKey,
  webSearch: braveWebSearch({ apiKey: braveKey }),
});
```

`chatCompletions()` hosts no search of its own. When a request carries the
`web_search` provider tool, the provider sends the attached tool to the model
as an ordinary function tool and the loop runs it as an ordinary tool call —
so the transcript shows `tool` parts, not `provider-tool` parts. An attached
tool is used wherever it is attached, including on OpenRouter, which hosts a
search of its own: don't attach one if you want OpenRouter's. A provider asked
for a provider tool it has nothing attached for fails the request (`ok: false`,
`error.kind` `"model"`, naming the tool). See [Web search](/cookbook/web-search)
and [Provider tools](/cookbook/provider-tools).

Provider `name` is `"anthropic"`, `"openai"`, `"gemini"`, or `"ChatCompletions"`.

## ProviderClientOptions

Applied when the client is constructed, not per request.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxRetries` | `number` | `2` | Retries after the first request. `0` disables. Must be ≥ 0. |
| `timeoutMs` | `number` | SDK default (`chatCompletions()`: 10 minutes per attempt) | Timeout for one request attempt. Must be ≥ 1. |
| `headers` | `Record<string, string>` | — | Extra headers sent with every request. |
| `fetch` | `typeof fetch` | global `fetch` | Replaces the global for this provider's requests. Called as `(url, init)` and must return a real `Response`; retries, `timeoutMs`, and the abort signal apply unchanged. A test that stubbed `globalThis.fetch` can pass a fake here instead. |

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

## Removed in 0.33.0: model registry; added in 0.34.0: ModelCatalog

The `@fifthrevision/axle/models` entry point (`Models`, `ModelInfo`,
`ModelMetadata`) no longer exists. Pass model IDs as plain strings; keep your
own table (or ask the provider's models API) when you need context windows or
output ceilings. See [Upgrading](/upgrading).

What 0.34.0 adds instead is a lookup, not a registry: `ModelCatalog` reads the
models.dev catalog (a canonical `publisher/model` layer plus a per-host layer
with each host's own ids, limits, and prices) and answers context-window
questions about it.

```typescript
import { ModelCatalog } from "@fifthrevision/axle";

const catalog = await ModelCatalog.open({ cachePath: "./.cache/axle-models.json" });
if (catalog.stale) await catalog.refresh();
const hit = catalog.contextWindow("openai/gpt-5.5");
// { window: 400000, id: "openai/gpt-5.5", match: "exact" } | undefined
```

```typescript
ModelCatalog.open(options?: ModelCatalogOptions): Promise<ModelCatalog>

interface ModelCatalogOptions {
  cachePath?: string; // where the slimmed catalog is kept between runs; omit for memory only
  maxAge?: number; // ms past which the catalog reports `stale`; default one day
  hosts?: string[]; // models.dev provider ids to keep (`anthropic`, `openrouter`, …); omit for all, `[]` skips hosts
  baseUrl?: string; // catalog origin; default https://models.dev
}
```

`open()` reads the cache and never touches the network; `refresh()` always
fetches (sending ETags so an unchanged catalog downloads nothing) and never
throws — a failed fetch keeps the cached copy. `lookup(model, { host?,
publisher? })` tries the host's own id first when a host is given, then the
canonical key, then a best-effort normalized match; `contextWindow(model,
options?)` maps that to `{ window, id, match }`. `size`, `fetchedAt`, and
`stale` describe the cache. When to refresh is the host's call.

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
  tools?: ExecutableTool[];
  createStreamingRequest(model: string, params: ProviderStreamParams): AsyncGenerator<AnyStreamChunk>;
}
```

`tools` are executable tools the provider brings: when the model calls a tool
whose name is not among the caller's tools, the loop runs the provider's tool
of that name. The caller's tool wins on a name collision. `chatCompletions()`
uses this for an attached `webSearch`. (`resolveProviderToolName` was removed
in 0.34.0 — the loop no longer asks a provider what it supports. See
[Upgrading](/upgrading).)

The request method is internal, and so are its types:
`ProviderStreamParams` and `AnyStreamChunk` are declared by the package but not
exported, so you can't name them from outside. (`createGenerationRequest`,
`ProviderGenerationParams`, and `ModelResult` were removed in 0.32.0 when
`generate()` was unified onto the streaming transport — see
[Upgrading](/upgrading).)

You *can* implement this interface to add your own provider, but it isn't
supported — the chunk and conversion contracts aren't stable across releases, so
expect to keep fixing it.

A custom provider receives `providerTools` unchanged, as before — core does not
read the names and holds no fallback. Serve a name yourself (as a hosted tool
or via `AIProvider.tools`) or fail the request before sending it: throwing a
plain `Error` from `createStreamingRequest` surfaces as `ok: false` with
`error.kind` `"model"`.

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
