---
title: Providers
description: Provider factories, request options, and the model catalog.
---

# Providers

Conceptual guide: [Providers & models](/concepts/providers).

## Factories

A provider says two things separately: the wire `protocol` it speaks and the `id` of the service it reaches (the models.dev provider id, stamped on usage rows).

```typescript
import { anthropic, openai, gemini, openrouter, togetherai, bedrock } from "@fifthrevision/axle";

anthropic(apiKey: string, options?: ProviderClientOptions): AIProvider
openai(apiKey: string, options?: ProviderClientOptions): AIProvider
gemini(apiKey: string, options?: ProviderClientOptions): AIProvider
openrouter(apiKey: string, options?: Omit<ChatCompletionsOptions, "baseUrl" | "apiKey" | "id" | "dialect"> & { baseUrl?: string }): AIProvider
togetherai(apiKey: string, options?: Omit<ChatCompletionsOptions, "baseUrl" | "apiKey" | "id" | "dialect">): AIProvider
bedrock(apiKey: string, options: BedrockOptions): AIProvider
```

```typescript
interface BedrockOptions extends ProviderClientOptions {
  protocol: "messages" | "responses" | "chatCompletions";
  region: string; // e.g. "us-east-1"
}
```

`bedrock()` follows the model: `messages` for Claude, `responses` or `chatCompletions` for what Mantle serves. Claude on Bedrock takes inference-profile ids (`us.anthropic.claude-haiku-4-5-20251001-v1:0`).

### Protocol constructors

Each protocol builds a provider at any base URL:

```typescript
import { messages, responses, generateContent, chatCompletions } from "@fifthrevision/axle";

messages(options: ProtocolOptions & { baseUrl: string; id?: string; resolveModel?: (model: string) => string }): AIProvider
responses(options: ProtocolOptions & { baseUrl: string; id?: string; resolveModel?: (model: string) => string }): AIProvider
generateContent(options: ProtocolOptions & { baseUrl: string; id?: string; resolveModel?: (model: string) => string }): AIProvider
chatCompletions(options: ChatCompletionsOptions & { baseUrl: string }): AIProvider
```

```typescript
interface ChatCompletionsOptions extends ProviderClientOptions {
  baseUrl: string;
  apiKey?: string;
  id?: string; // usage-row label, e.g. "openrouter"
  dialect?: ChatCompletionsDialect; // openrouterDialect | togetheraiDialect
  resolveModel?: (model: string) => string;
  webSearch?: ExecutableTool; // serves `web_search` requests on this provider
}
```

The official hostnames infer `id` and `dialect` when omitted:

| Hostname | `id` | `dialect` |
| --- | --- | --- |
| `openrouter.ai`, `api.openrouter.ai` | `openrouter` | `openrouterDialect` |
| `api.together.ai`, `api.together.xyz` | `togetherai` | `togetheraiDialect` |

A `chatCompletions()` provider without the OpenRouter dialect no longer reads OpenRouter's `reasoning_details` or the `content` of a citation from responses; behind a proxy to OpenRouter, pass `dialect: openrouterDialect` to keep reasoning continuity and cited text. Model IDs are never rewritten — pass the slug the gateway lists.

`vendor` and `inferChatCompletionsVendor` were removed in 0.35.0; `chatCompletions({ baseUrl }).id` gives what the hostname implies. `ChatCompletionsVendor` is removed. See [Upgrading](/upgrading).

### webSearch

```typescript
import { chatCompletions, braveWebSearch, openrouterDialect } from "@fifthrevision/axle";

const provider = chatCompletions({
  baseUrl: "https://api.together.xyz/v1",
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
`error.kind` `"api"`, naming the tool). See [Web search](/cookbook/web-search)
and [Provider tools](/cookbook/provider-tools).

## ProviderClientOptions

Applied when the client is constructed, not per request.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxRetries` | `number` | `2` | Retries after the first request. `0` disables. Must be ≥ 0. |
| `timeoutMs` | `number` | SDK default (`chatCompletions()`: 10 minutes per attempt) | Timeout for one request attempt. Must be ≥ 1. |
| `headers` | `Record<string, string>` | — | Extra headers sent with every request. |
| `fetch` | `typeof fetch` | global `fetch` | Replaces the global for this provider's requests. Called as `(url, init)` and must return a real `Response`; retries, `timeoutMs`, and the abort signal apply unchanged. A test that stubbed `globalThis.fetch` can pass a fake here instead. |

Non-integer or out-of-range values throw `AxleError` (`INVALID_OPTIONS`) at construction.

`baseUrl` on the first-party factories was removed in 0.35.0 — they are presets at the service's own base URL. To send the same requests elsewhere, call the protocol constructor with that base URL. `typesafe()` keeps its `baseUrl`, and `openrouter()` takes one for OpenRouter's regional hosts.

## AxleModelRequestOptions

Portable per-request options. Settable on `AgentConfig`, on `SendMessageOptions`,
and on `GenerateParams` / `StreamParams`.

| Option | Type | Description |
| --- | --- | --- |
| `reasoning` | `ReasoningSetting` | Portable thinking/reasoning control: `"default"`, `"off"`, `"on"`, or `{ effort: "low" \| "medium" \| "high", display?: "visible" \| "hidden" }`. |
| `maxOutputTokens` | `number` | Output token cap. |
| `toolChoice` | `ToolChoice` | Tool-use constraint. |
| `parallelToolCalls` | `boolean` | Ask the provider to avoid parallel tool calls. |
| `cache` | `boolean` | Whether Axle asks the provider to cache the prompt prefix where asking is required (Anthropic, OpenRouter). Defaults to `true`. Providers that cache on their own (OpenAI, Gemini, Together) are unaffected by either value. An explicit `providerOptions.cache_control` overrides the default. |
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
ids (`"anthropic/claude-sonnet-4-5"`). Presets strip a matching
prefix and **throw** (`INVALID_OPTIONS`) on a mismatched one:

```typescript
anthropic(key); // model "openai/gpt-5.1" → throws
```

| Preset | Accepted prefixes |
| --- | --- |
| `anthropic()` | `anthropic/` |
| `openai()` | `openai/` |
| `gemini()` | `google/`, `gemini/` |
| `openrouter()` / `togetherai()` / `chatCompletions()` | Any — passed through (a raw protocol constructor sends the id as given; pass `resolveModel` to strip) |

Because namespaced ids are also what OpenRouter's API expects, the same model
string works against a first-party provider and an inference gateway without
change. See
[One model string, any inference provider](/concepts/providers#one-model-string-any-inference-provider).

OpenRouter slugs are sent unchanged. If OpenRouter lists a model under a slug
that differs from the publisher's canonical form (casing, or a different author
prefix — `z-ai/glm-5.3`, not `zai/glm-5.3`), pass OpenRouter's slug. IDs that
were already OpenRouter slugs are unaffected.

## Model catalog and cost

Conceptual guide: [Model catalog & cost](/concepts/model-catalog).

The `@fifthrevision/axle/models` entry point (`Models`, `ModelInfo`,
`ModelMetadata`) no longer exists (removed in 0.33.0). Pass model IDs as plain strings.

::: warning Experimental
`ModelCatalog`, `ModelCatalogStore`, the catalog functions and `computeCost`
are marked `@experimental`: they are new in 0.35.0 and may change in a minor
release.
:::

```typescript
import { ModelCatalogStore, catalogFile } from "@fifthrevision/axle";

const file = catalogFile("./.cache/axle-models.json");
const catalogs = new ModelCatalogStore({ providers: ["anthropic"] });
catalogs.load(await file.read());
const snapshot = await catalogs.refreshIfStale();
if (snapshot) await file.write(snapshot);
const catalog = catalogs.current; // ModelCatalog | undefined
const hit = catalog?.contextWindow("openai/gpt-5.5", { provider: "openai" });
// { window, id, match } | undefined
```

### ModelCatalog

```typescript
class ModelCatalog {
  constructor(data: CatalogData);
  get fetchedAt(): string; // ISO 8601, read back from the data
  get coverage(): "all" | string[]; // the provider filter the data was fetched with
  lookup(model: string, options?: { provider?: string; publisher?: string }): CatalogMatch | undefined;
  contextWindow(model: string, options?: { provider?: string; publisher?: string }): ContextWindowMatch | undefined;
}
```

A synchronous, immutable index over `CatalogData` (version 4: a canonical
`publisher/model` layer plus a per-provider layer with each provider's own ids,
limits and prices). It never fetches — new data means a new catalog — and takes
its data as given, so read saved JSON with `parseCatalogData`, not `JSON.parse`.
Loading and refreshing live in `ModelCatalogStore`, which never touches storage.

`lookup` resolves in three steps and `match` reports which one answered. Both
options are optional; `{ provider }` and `{ publisher }` replace the old
`{ host }`.

| `match` | How it matched |
| --- | --- |
| `"provider"` | `options.provider`'s own ids, compared case-insensitively. When the model id's publisher *is* the provider, the bare name is tried too (`anthropic/claude-sonnet-5` matches the provider's `claude-sonnet-5`). The only match that carries `cost`. |
| `"exact"` | the canonical `publisher/model` key — a bare id is qualified with `options.publisher` when one is given — or a unique exact match on the normalized model name |
| `"prefix"` | a unique prefix match on the normalized name |

Normalizing drops trailing build tags (`mlx`, `latest`, `gguf`, `q4_0`, `fp16`,
`bf16`) and ignores punctuation, case and the publisher, which is what makes a
local runtime's `gemma4:26b-mlx` findable. An ambiguous name — two models
normalize alike, or several share the prefix — returns `undefined`, as does no
match at all.

```typescript
interface CatalogMatch {
  id: string; // the canonical publisher/model id, or provider/id for a model only that provider lists
  match: "provider" | "exact" | "prefix";
  model: CatalogModel;
  cost?: ModelCost; // provider matches only
}

interface ContextWindowMatch {
  window: number; // model.limit.context
  id: string;
  match: "provider" | "exact" | "prefix";
}
```

A provider match merges that provider's own `limit` over the canonical model's,
so `model.limit` is the limit for the service you named.

### CatalogModel and ModelCost

```typescript
interface CatalogModel {
  name: string;
  limit: { context: number; output?: number; input?: number };
  reasoning: boolean;
  toolCall: boolean;
  structuredOutput?: boolean;
  attachment: boolean;
  modalities: { input: string[]; output: string[] };
  knowledge?: string; // training cutoff
}

interface ModelCost {
  input: number; // USD per million tokens
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  tiers?: {
    size: number;
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    reasoning?: number;
  }[];
}
```

A `tiers` entry prices a request whose context exceeds `size`; entries ascend by
size, and the last one a request exceeds wins.

### ModelCatalogStore

```typescript
class ModelCatalogStore {
  constructor(options?: ModelCatalogStoreOptions);
  get current(): ModelCatalog | undefined;
  load(json: string | undefined): void;
  refresh(): Promise<string | undefined>;
  refreshIfStale(): Promise<string | undefined>;
  snapshot(): string | undefined;
}

interface ModelCatalogStoreOptions extends Omit<FetchModelsDevOptions, "previous"> {
  providers?: string[]; // models.dev provider ids to keep; omit for all, [] to skip the layer
  maxAge?: number; // ms past which refreshIfStale() fetches; default one day
  timeout?: number; // fetch timeout; default 10s
  baseUrl?: string; // catalog origin; default https://models.dev
  signal?: AbortSignal;
}
```

- `load(json)` takes the saved JSON and ignores anything that is not usable
  `CatalogData` — missing, corrupt, or written by an older Axle. It never
  throws, and `current` stays as it was.
- `refresh()` fetches with the current data's ETags and makes the result
  current. It resolves the JSON snapshot to save, or `undefined` when the fetch
  failed: it never rejects for the network. Concurrent calls share one fetch.
  Nothing refreshes on its own.
- `refreshIfStale()` is `refresh()` when there is no data or it is older than
  `maxAge`, and otherwise resolves `undefined`.
- `snapshot()` is the current data as JSON, or `undefined` when there is none.

### Storage

```typescript
catalogFile(path: string): CatalogStorage

interface CatalogStorage {
  read(): Promise<string | undefined>;
  write(json: string): Promise<void>;
}
```

`catalogFile` writes atomically (temp file, then rename) and creates the parent
directory; an unreadable or missing file reads as `undefined`. The store only
ever hands out and takes JSON text, so any `CatalogStorage` — a database row, an
object store — works the same way.

### fetchModelsDev

```typescript
fetchModelsDev(options?: FetchModelsDevOptions): Promise<CatalogData>

interface FetchModelsDevOptions {
  providers?: string[]; // models.dev provider ids to keep; omit for all, [] skips the provider layer
  previous?: CatalogData; // send its ETags; an unchanged layer downloads nothing
  timeout?: number; // whole-fetch budget in ms; default 10_000
  baseUrl?: string; // default https://models.dev
  signal?: AbortSignal;
}

class CatalogFetchError extends Error {} // cause holds the underlying error
```

Fetches both layers and slims them to what the catalog reads. It rejects with
`CatalogFetchError` when either layer cannot be fetched or parsed — a network
failure, the timeout, an HTTP error status, a body of the wrong shape — and
there is no partial result, so the data you already had remains the best you
have. `fetchedAt` is always the time of this fetch, even for a layer that came
back `304`. The `providers` filter is recorded as `coverage`, and a `previous`
fetched under a different filter is not reused for the provider layer (its
canonical layer still is).

### CatalogData

```typescript
interface CatalogData {
  version: 4;
  fetchedAt: string; // ISO 8601
  etags: { models?: string; api?: string };
  coverage: "all" | string[];
  models: Record<string, CatalogModel>; // keyed publisher/model
  providers: Record<string, Record<string, ProviderEntry>>; // provider id → its own model ids
}

interface ProviderEntry {
  canonical?: string; // key into models
  model?: CatalogModel; // for a model only this provider lists
  limit?: Partial<CatalogModel["limit"]>; // overrides the canonical limit
  cost?: ModelCost;
}
```

Plain JSON, and yours to edit before building a catalog: a negotiated price, a
self-hosted model, a test fixture with no network. `parseCatalogData(json)`
returns it, or `undefined` for text that is not JSON or is another version or
shape — which means there is no usable copy and the answer is to fetch.
`ProviderEntry` is not exported; it is the shape inside `CatalogData.providers`.

### computeCost

```typescript
import { computeCost } from "@fifthrevision/axle";

const cost = computeCost(usage, catalog);
// { usd, priced: PricedEntry[], unpriced: UnpricedEntry[], pricedWith? }
```

```typescript
computeCost(usage: Stats, catalog?: ModelCatalog): Cost;
```

Synchronous, never throws. It prices each `breakdown` row on its own: the row's
`provider` and `model` (then `requestedModel`) are looked up in the provider
layer, the tier is the one the row's own `in` selects, and cached, cache-write
and reasoning tokens are priced at their own rates where the provider lists
them, the rest at the plain input/output rate. `usd` sums `priced` only.
`pricedWith` is the catalog's `fetchedAt`, absent when no row was priced.

Unpriced rows carry `reason`:

| `reason` | Meaning |
| --- | --- |
| `no-catalog` | no catalog was passed |
| `no-provider` | the row has no `provider` id |
| `unlisted` | the catalog has no `"provider"` match for that provider and model |
| `no-price` | the provider lists the model but no price |

Full `Cost`, `PricedEntry` and `UnpricedEntry` shapes are in the [Observability
reference](/reference/observability#usage-stats-breakdown-and-cost).

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
this with the agent's own state and no `limit`, so its result carries neither
`limit` nor `free`; pass one yourself — from
[`catalog.contextWindow()`](#modelcatalog), say — to get them.

## AIProvider

```typescript
interface AIProvider {
  readonly protocol: Protocol; // "messages" | "responses" | "generateContent" | "chatCompletions"
  readonly id?: string; // models.dev provider id; stamped on usage rows
  tools?: ExecutableTool[];
  createStreamingRequest(model: string, params: ProviderStreamParams): AsyncGenerator<AnyStreamChunk>;
}
```

`name` was replaced by `protocol` + `id` in 0.35.0 (`"anthropic"` → `protocol: "messages", id: "anthropic"`; `"OpenAI"` → `responses`/`openai`; `"Gemini"` → `generateContent`/`google`; `"ChatCompletions"` → `chatCompletions`/vendor id). A provider with no `id` (a local server) leaves usage rows without `provider`.

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
or via `AIProvider.tools`) or fail the request before sending it: throwing an
`AxleError` from `createStreamingRequest` surfaces per the [Errors](/reference/errors) rules.

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
