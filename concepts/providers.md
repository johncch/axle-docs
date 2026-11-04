---
title: Providers & models
description: Picking an inference backend, naming models, and controlling requests portably.
---

# Providers & models

A provider is an adapter that turns Axle's normalized request into one vendor's
API call. You make one, hand it to an `Agent` (or to `stream()` / `generate()`),
and then mostly forget about it.

```typescript
import { anthropic, openai, gemini, chatCompletions, openrouter, togetherai } from "@fifthrevision/axle";

const a = anthropic(process.env.ANTHROPIC_API_KEY!);
const o = openai(process.env.OPENAI_API_KEY!);
const g = gemini(process.env.GEMINI_API_KEY!);
const local = chatCompletions({ baseUrl: "http://localhost:11434/v1" });
```

`chatCompletions` points at any OpenAI-compatible endpoint — Ollama, vLLM,
OpenRouter, Together, LM Studio. It takes one options object (`{ baseUrl, apiKey,
id?, dialect? }`). The official hostnames still infer `id` and `dialect`
automatically — OpenRouter's `https://openrouter.ai/api/v1` gets
`openrouterDialect`, Together's hosts get `togetheraiDialect` — or pass your own
for a proxy (`{ baseUrl: "https://gateway.example.com/v1", apiKey, id:
"openrouter", dialect: openrouterDialect }`). Prefer the `openrouter(apiKey)` and
`togetherai(apiKey)` presets when you're talking to those services directly, and
`bedrock(apiKey, { protocol, region })` for Amazon Bedrock (protocol follows the
model: `messages` for Claude, `responses` or `chatCompletions` for what Mantle
serves).

## Switching providers

Provider and model are two constructor fields. That's the whole switch — your
tools, `Instruct`s, schemas, and event handling don't change at all. And if you
name models the [portable way](#one-model-string-any-inference-provider), often
only the provider changes.

```typescript
const agent = new Agent({ provider: a, model: "claude-sonnet-4-5" });
// same tools, same Instructs, same events
const cheaper = new Agent({ provider: g, model: "gemini-2.5-flash" });
```

A fair warning about what *isn't* portable: `providerOptions` (it's raw
passthrough), provider tool configuration payloads, and whatever a particular
model chooses to do with `reasoning`. Those are the escape hatches, and using
them ties that agent to that vendor. Which is fine — just know when you're doing
it. Enabling reasoning (`"on"` or `{ effort }`) now also requests disclosure
wherever a request field exists, so Claude and OpenAI stream thinking where they
previously streamed none — pass `{ effort, display: "hidden" }` to keep the old
wire behaviour. See [Reasoning models](/cookbook/reasoning#disclosure-vs-form).

## Naming models

You can pass whatever string the vendor expects:

```typescript
model: "claude-sonnet-4-5";
model: "gpt-5.1";
```

But there's a better option. First-party providers also accept
**publisher-namespaced** ids and strip the prefix themselves:

```typescript
model: "anthropic/claude-sonnet-4-5"; // anthropic() sends "claude-sonnet-4-5"
```

Both forms work identically against `anthropic()`. The reason to prefer the
namespaced one is that it's a *portable identity* rather than one vendor's wire
format.

### One model string, any inference provider

Third-party inference providers like OpenRouter address models by publisher —
`anthropic/claude-sonnet-4-5` is already exactly what their API wants. So the
namespaced form is the string that works everywhere:

```typescript
const model = "anthropic/claude-sonnet-4-5";

// direct — strips the prefix
new Agent({ provider: anthropic(key), model });

// through OpenRouter — passes it straight through
new Agent({ provider: openrouter(key), model });
```

Same string, no branching. Switching between a first-party provider and an
inference provider becomes a one-line provider change — which is what you want
when you're moving between direct API access and a gateway for cost, routing, or
availability reasons.

Pass the slug the gateway lists. `chatCompletions()` no longer rewrites model
IDs — the alias table for OpenRouter slugs that differed from the publisher's
canonical form was removed in 0.33.0, so `zai/glm-5.3` stays `zai/glm-5.3` and
you should pass `z-ai/glm-5.3` yourself.

### The safety net

Hand a model from the wrong publisher to a first-party provider and it throws
immediately rather than forwarding it and failing at the API — `anthropic()`
rejects `"openai/gpt-5.1"` before it costs you a round trip.

Accepted prefixes are what you'd guess, with one convenience: `gemini()` takes
both `google/` and `gemini/`.

### No model registry — but there is a ModelCatalog

There is no model registry. Axle ships no list of models, no context windows, no
output ceilings — model IDs are plain strings your application owns. If you need
a ceiling or a capability flag, keep your own table or ask the provider's models
API. A model hosted by several vendors has a different ID on each, so a shared
constant could never be portable with `chatCompletions()` anyway.

```typescript
const model = "openai/gpt-5.5";
```

(The `@fifthrevision/axle/models` entry point and its `Models`, `ModelInfo`,
and `ModelMetadata` exports were removed in 0.33.0 — see
[Upgrading](/upgrading).)

What 0.35.0 keeps is narrower: `ModelCatalog`, a synchronous, immutable index
over the models.dev catalog for answering "how big is this model's window?"
without keeping your own table — and `computeCost(usage, catalog)` for pricing
a `Stats` at each request's own tier. Load saved JSON, refresh when it's stale,
and ask:

```typescript
import { ModelCatalogStore, catalogFile, computeCost } from "@fifthrevision/axle";

const file = catalogFile("./.cache/axle-models.json");
const catalogs = new ModelCatalogStore({ providers: ["anthropic"] });
catalogs.load(await file.read());
const snapshot = await catalogs.refreshIfStale();
if (snapshot) await file.write(snapshot);
const catalog = catalogs.current;
const hit = catalog?.contextWindow("openai/gpt-5.5");
// { window, id, match } | undefined
```

`new ModelCatalog(data)` takes its data as given; `fetchModelsDev()` fetches
`CatalogData` (version 4) and `parseCatalogData()` reads saved JSON. `lookup`
and `contextWindow` take `{ provider }`, not `{ host }`. When to refresh is
your call — drive a compaction threshold or a progress meter with it; price
with `computeCost`. Full signatures are in the [Providers
reference](/reference/providers#model-catalog-and-cost).

## Request options

These get normalized by Axle and mapped onto each provider's request shape. Set
them as defaults on the `Agent`, or per send when one call needs something
different.

```typescript
const agent = new Agent({
  provider,
  model,
  maxOutputTokens: 4096,
  reasoning: "on",
});

// Just this one send — merged over the agent's defaults
await agent.send("...", { maxOutputTokens: 1024 }).final;
```

| Option | What it does |
| --- | --- |
| `reasoning` | Portable thinking/reasoning control: `"default"`, `"off"`, `"on"`, or `{ effort: "low" \| "medium" \| "high", display?: "visible" \| "hidden" }` — `display` (default `"visible"`) asks the provider to disclose its thinking |
| `maxOutputTokens` | Caps output tokens for the request |
| `toolChoice` | `"auto"`, `"none"`, `"required"`, or `{ type: "tool", name }` |
| `parallelToolCalls` | Asks the provider to avoid parallel tool calls |
| `cache` | Asks the provider to cache the prompt prefix where asking is required (Anthropic, OpenRouter). Defaults to on; `false` omits the field |
| `providerOptions` | Raw passthrough, applied *after* Axle's mappings |
| `signal` | Aborts the request |

Sampling controls (`temperature`, `topP`) and stop sequences were removed in
0.33.0 — they were never portable, and the newest models reject them. Send them
through `providerOptions` using the provider's own field names:

```typescript
await agent.send("...", { providerOptions: { temperature: 0.2 } }).final;
```

| Removed option | Anthropic | OpenAI | Gemini | Chat Completions |
| --- | --- | --- | --- | --- |
| `temperature` | `temperature` | `temperature` | `temperature` | `temperature` |
| `topP` | `top_p` | `top_p` | `topP` | `top_p` |
| `stop` | `stop_sequences` | not supported | `stopSequences` | `stop` |

`providerOptions` merges key by key with the agent's defaults and lands last, so
it can deliberately override Axle's own mapping. It's the escape hatch for
anything Axle hasn't normalized yet.

### Prompt caching

Axle asks the provider to cache the prompt prefix wherever asking is required.
Requests to the Anthropic provider — and chat-completions requests to the
OpenRouter vendor — carry a top-level `cache_control: { type: "ephemeral" }`
unless you pass `cache: false`. The provider puts one cache breakpoint on the
last cacheable block and moves it forward as the conversation grows, so in a
tool loop each step reads everything so far at cache-read rates and writes only
what the previous step added. OpenAI, Gemini, and Together cache automatically
and get no field; `cache` is ignored there, at either value.

On by default is the loop's doing. Without it, every step of every tool loop
re-bills the whole conversation at full price. The trade lands on one-shot
prompts: a prompt that is never repeated pays the ~25% cache-write premium for
a read that never comes, and a prompt under the model's minimum cacheable
length (512 to 4,096 tokens on Anthropic, by model) is silently not cached
either way. That one-shot case is the case for opting out:

```typescript
await generate({ provider, model, messages, cache: false });
new Agent({ provider, model, cache: false });
```

Two things worth knowing. First, `cache: false` means "do not ask", not "do not
cache" — the automatic providers are unaffected. Second, an explicit
`providerOptions.cache_control` still wins over the default, so a host that
placed its own marker — or wants Anthropic's one-hour TTL instead of the
five-minute default — is unchanged.

`result.usage` reports what happened: `cachedIn` is tokens read from cache and
`cacheWriteIn` tokens written, both already counted inside `in` (see [Token
usage](/concepts/observability#token-usage)). And one OpenRouter wrinkle: a hit
needs the next request to reach the same upstream host, which OpenRouter pins
by `session_id`. `Agent` always sends its `sessionId`, and a bare `generate()`
or `stream()` call gets a fresh id for its own tool loop — so hits across
separate calls need a `sessionId` you pass to both. Full signatures are in the
[Providers reference](/reference/providers#axlemodelrequestoptions).

## Retries and timeouts

These belong to the client, so you set them when you build the provider rather
than per request.

```typescript
const provider = anthropic(apiKey, { maxRetries: 0, timeoutMs: 30_000 });
```

`maxRetries` defaults to `2` on the built-in providers. `timeoutMs` defaults to
whatever the vendor SDK does — except `chatCompletions()`, which gives up each
attempt after ten minutes (the default the OpenAI and Anthropic SDKs already
apply). The timer covers the wait for the response to start, not the stream
that follows, and it restarts on every retry. A `chatCompletions()` timeout
fails as `TimeoutError` (`"Request timed out after <n>ms"`); aborting through
your own signal still reports `AbortError`.

Every provider factory, `typesafe()` included, also takes a `fetch` that
replaces the global for that provider's requests — handy for logging or tests:

```typescript
declare const loggingFetch: typeof fetch;

const provider = chatCompletions({ baseUrl: "http://localhost:11434/v1", fetch: loggingFetch });
```

### Reaching a proxy instead of the vendor

Sometimes the request shouldn't go to the vendor at all — a gateway that
speaks the vendor's API, a logging proxy in front of it, a test double. That's
what the protocol constructors are for: `messages()`, `responses()`,
`generateContent()`, and `chatCompletions()` each take `{ baseUrl, apiKey, …
}` and speak one wire format at any base URL.

```typescript
import { messages, responses, generateContent } from "@fifthrevision/axle";

const viaProxy = messages({ baseUrl: "https://proxy.example.com", apiKey });
const viaOpenAIProxy = responses({ baseUrl: "https://proxy.example.com/v1", apiKey });
const viaGeminiProxy = generateContent({ baseUrl: "https://proxy.example.com", apiKey });
```

`anthropic()`, `openai()`, and `gemini()` are now presets — the protocol
constructor at the service's own base URL — so they no longer take `baseUrl`.
(`typesafe()` keeps its `baseUrl`, and `openrouter()` takes one for OpenRouter's
regional hosts.) A preset passes its base URL explicitly, so the SDKs' own
environment variables no longer redirect it. Each preset accepts a namespaced
model id and strips the prefix; a raw constructor sends the id as given — pass
`resolveModel` if you relied on the preset's stripping. Full signatures are in
the [Providers reference](/reference/providers#providerclientoptions).

## How full is the context?

```typescript
const usage = agent.context();
// { total, system, tools, mcpTools, providerTools, messages }
```

One caveat worth internalizing: these are **estimates**, computed locally from
your messages and tool payloads. They're not what the provider will bill you.
They're good enough to drive a compaction threshold or a progress meter, and not
good enough for accounting. For real numbers, read `result.usage` after a send.

## Next

- [Agent](/concepts/agent) — the thing that uses a provider
- [Tools](/concepts/tools) — including the provider-managed kind
- [Providers reference](/reference/providers) — every factory signature
