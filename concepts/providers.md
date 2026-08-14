---
title: Providers & models
description: Picking an inference backend, naming models, and controlling requests portably.
---

# Providers & models

A provider is an adapter that turns Axle's normalized request into one vendor's
API call. You make one, hand it to an `Agent` (or to `stream()` / `generate()`),
and then mostly forget about it.

```typescript
import { anthropic, openai, gemini, chatCompletions } from "@fifthrevision/axle";

const a = anthropic(process.env.ANTHROPIC_API_KEY!);
const o = openai(process.env.OPENAI_API_KEY!);
const g = gemini(process.env.GEMINI_API_KEY!);
const local = chatCompletions("http://localhost:11434/v1");
```

`chatCompletions` points at any OpenAI-compatible endpoint — Ollama, vLLM,
OpenRouter, Together, LM Studio. It recognizes a few known hostnames
(OpenRouter, Together) and adjusts, or you can tell it which vendor you're
talking to.

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
it.

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
new Agent({ provider: chatCompletions("https://openrouter.ai/api/v1", key), model });
```

Same string, no branching. Switching between a first-party provider and an
inference provider becomes a one-line provider change — which is what you want
when you're moving between direct API access and a gateway for cost, routing, or
availability reasons.

Axle also keeps a small alias table for the handful of models where OpenRouter's
slug differs from the publisher's canonical form (casing, or a different author
prefix — `zai/glm-5.2` is `z-ai/glm-5.2` there). Those are corrected for you.

This doesn't rescue you when two providers genuinely disagree about a model's
name, but the frontier labs are consistent enough that it covers most of what
you'll hit.

### The safety net

Hand a model from the wrong publisher to a first-party provider and it throws
immediately rather than forwarding it and failing at the API — `anthropic()`
rejects `"openai/gpt-5.1"` before it costs you a round trip.

Accepted prefixes are what you'd guess, with one convenience: `gemini()` takes
both `google/` and `gemini/`.

### The model catalog

```typescript
import { Models, ModelInfo } from "@fifthrevision/axle/models";

Models.Anthropic.CLAUDE_SONNET_4_5; // "anthropic/claude-sonnet-4-5"
ModelInfo[Models.Anthropic.CLAUDE_SONNET_4_5];
// { contextWindow: 200000, maxOutputTokens: 64000, multimodal: true }
```

The catalog is a convenience, not a gate. Raw strings always work, so a
brand-new model is usable before the catalog has heard of it. Models their
publisher has deprecated carry a `@deprecated` tag, so your editor will nudge
you.

## Request options

These get normalized by Axle and mapped onto each provider's request shape. Set
them as defaults on the `Agent`, or per send when one call needs something
different.

```typescript
const agent = new Agent({
  provider,
  model,
  temperature: 0.2,
  maxOutputTokens: 4096,
  reasoning: true,
});

// Just this one send — merged over the agent's defaults
await agent.send("...", { temperature: 0.9 }).final;
```

| Option | What it does |
| --- | --- |
| `reasoning` | Turns provider thinking/reasoning controls on or off |
| `maxOutputTokens` | Caps output tokens for the request |
| `temperature`, `topP` | Sampling |
| `stop` | Stop sequence(s) |
| `toolChoice` | `"auto"`, `"none"`, `"required"`, or `{ type: "tool", name }` |
| `parallelToolCalls` | Asks the provider to avoid parallel tool calls |
| `providerOptions` | Raw passthrough, applied *after* Axle's mappings |
| `signal` | Aborts the request |

`providerOptions` merges key by key with the agent's defaults and lands last, so
it can deliberately override Axle's own mapping. It's the escape hatch for
anything Axle hasn't normalized yet.

## Retries and timeouts

These belong to the client, so you set them when you build the provider rather
than per request.

```typescript
const provider = anthropic(apiKey, { maxRetries: 0, timeoutMs: 30_000 });
```

`maxRetries` defaults to `2` on the built-in providers. `timeoutMs` defaults to
whatever the vendor SDK does.

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
