---
title: Providers & models
description: Protocols, providers and presets; naming models; controlling requests portably.
---

# Providers & models

A provider answers two questions, and since 0.35.0 it answers them in two
separate fields: **which wire format** to speak, and **which service** to speak
it to.

```typescript
import { anthropic } from "@fifthrevision/axle";

const a = anthropic(process.env.ANTHROPIC_API_KEY!);
a.protocol; // "messages"  — the wire format it speaks
a.id;       // "anthropic" — the service it reaches, as models.dev names it
```

You hand one to an `Agent` (or to `stream()` / `generate()`) and then mostly
forget about it. The split is still worth understanding once, because it is what
makes "same model, different route" a one-line change.

## The four protocols

Four wire formats cover the field. Each has a constructor of the same name that
returns a provider speaking it at any base URL.

| Protocol | The API it speaks | Who serves it |
| --- | --- | --- |
| `messages` | Anthropic Messages | Anthropic; Claude on Bedrock |
| `responses` | OpenAI Responses | OpenAI; what Mantle serves on Bedrock |
| `generateContent` | Google Gemini | Gemini |
| `chatCompletions` | OpenAI Chat Completions | everyone else: OpenRouter, Together, Ollama, vLLM, LM Studio, most gateways |

A protocol is not a vendor — that's the point of keeping the two apart.
`messages` serves Anthropic, Claude on Bedrock, and any proxy in front of
either; `chatCompletions` serves a dozen services that implement one API. One
string could never say both things, which is why `AIProvider.name` became
`protocol` + `id` in 0.35.0.

## Presets

The named factories are presets: a protocol constructor with one service's base
URL, `id` and quirks filled in. There is nothing else in them.

```typescript
import { anthropic, messages, openrouter, chatCompletions, openrouterDialect } from "@fifthrevision/axle";

anthropic(apiKey);
// is messages({ baseUrl: "https://api.anthropic.com", apiKey, id: "anthropic", resolveModel: … })

openrouter(apiKey);
// is chatCompletions({ baseUrl: "https://openrouter.ai/api/v1", apiKey, id: "openrouter", dialect: openrouterDialect })
```

| Preset | Protocol | `id` |
| --- | --- | --- |
| `anthropic(apiKey)` | `messages` | `anthropic` |
| `openai(apiKey)` | `responses` | `openai` |
| `gemini(apiKey)` | `generateContent` | `google` |
| `openrouter(apiKey)` | `chatCompletions` | `openrouter` |
| `togetherai(apiKey)` | `chatCompletions` | `togetherai` |
| `bedrock(apiKey, { protocol, region })` | the one you name | `amazon-bedrock` |

`bedrock()`'s protocol follows the model: `messages` for Claude, `responses` or
`chatCompletions` for what Mantle serves.

Call a constructor yourself when no preset fits — a gateway, a logging proxy, a
local runtime, a test double:

```typescript
import { chatCompletions, messages } from "@fifthrevision/axle";

const local = chatCompletions({ baseUrl: "http://localhost:11434/v1" });
const viaProxy = messages({ baseUrl: "https://proxy.example.com", apiKey });
```

Presets take no `baseUrl` of their own; redirecting one is what the constructor
is for. (`openrouter()` is the exception, for OpenRouter's regional hosts, and
`typesafe()` — a [decision provider](/concepts/decisions), not an `AIProvider` —
keeps its own.) A preset also passes its base URL explicitly, so the vendor
SDKs' environment variables no longer redirect it.

## What each field is for

**`protocol`** builds the request and parses the stream. It is the only field
that decides what goes over the wire.

**`id`** is the models.dev provider id, stamped on every usage row — which is
how a run gets priced, since a price belongs to a service and model together,
not to a model alone. Each constructor infers it from the base URL's hostname
when it recognizes one (`api.anthropic.com`, `api.openai.com`,
`generativelanguage.googleapis.com`, `openrouter.ai`, `api.together.ai`,
`api.together.xyz`, subdomains included) and leaves it `undefined` otherwise, so
a provider at `localhost` produces rows that can't be priced. Point a known
service's protocol at your own hostname and you should pass `id` yourself. See
[Model catalog & cost](/concepts/model-catalog).

**`dialect`** exists on `chatCompletions` alone, and carries one service's
deltas from the shared API: the fields that express a reasoning setting, what
keeps a session pinned to the same upstream, which provider tools the service
hosts itself, how it reports a citation. Axle ships `openrouterDialect` and
`togetheraiDialect`, and infers the dialect from the same hostnames as the `id`.
Behind a proxy the hostname says nothing, so pass both:

```typescript
const viaGateway = chatCompletions({
  baseUrl: "https://gateway.example.com/v1",
  apiKey,
  id: "openrouter",
  dialect: openrouterDialect,
});
```

A `chatCompletions()` provider works without a dialect; it just won't read
OpenRouter's `reasoning_details` or a citation's quoted text, so thinking
continuity is lost. Prefer the `openrouter(apiKey)` and `togetherai(apiKey)`
presets when you talk to those services directly.

Two providers can share an `id` — Bedrock in two regions — and one protocol
serves many ids. Both are fine: the fields are independent on purpose.

## Switching providers

Provider and model are two constructor fields. That's the whole switch — your
tools, `Instruct`s, schemas, and event handling don't change at all. And if you
name models the [portable way](#one-model-string-any-inference-provider), often
only the provider changes.

```typescript
const agent = new Agent({ provider: anthropic(apiKey), model: "claude-sonnet-4-5" });
// same tools, same Instructs, same events
const cheaper = new Agent({ provider: gemini(apiKey), model: "gemini-2.5-flash" });
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

Stripping is the preset's doing, not the protocol's: a constructor you call
yourself sends the model id exactly as given. Pass `resolveModel` if you want
the same behaviour behind your own base URL. Full signatures are in the
[Providers reference](/reference/providers#protocol-constructors).

### No model registry

There is no model registry. Axle ships no list of models, no context windows, no
output ceilings — model IDs are plain strings your application owns. A model
hosted by several vendors has a different ID on each, so a shared constant could
never be portable with `chatCompletions()` anyway.

```typescript
const model = "openai/gpt-5.5";
```

(The `@fifthrevision/axle/models` entry point and its `Models`, `ModelInfo`,
and `ModelMetadata` exports were removed in 0.33.0 — see
[Upgrading](/upgrading).)

When you do need a ceiling, a capability flag or a price, there is an opt-in
data layer for it: `ModelCatalog` indexes the models.dev catalog, and
`computeCost(usage, catalog)` prices a `Stats` with it. Neither is a registry —
you load and store the data, and the runtime never consults it. See [Model
catalog & cost](/concepts/model-catalog).

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

## How full is the context?

```typescript
const usage = agent.context();
// { total, system, tools, mcpTools, providerTools, messages }
```

One caveat worth internalizing: these are **estimates**, computed locally from
your messages and tool payloads. They're not what the provider will bill you.
They're good enough to drive a compaction threshold or a progress meter, and not
good enough for accounting. For real numbers, read `result.usage` after a send.

What `agent.context()` can't tell you is how full "full" is — it reports no
limit, because the runtime keeps no table of windows. [Model catalog &
cost](/concepts/model-catalog#budgeting-the-window) is where the limit comes
from.

## Next

- [Agent](/concepts/agent) — the thing that uses a provider
- [Model catalog & cost](/concepts/model-catalog) — windows, prices, and where
  `provider.id` lands
- [Tools](/concepts/tools) — including the provider-managed kind
- [Providers reference](/reference/providers) — every factory signature
