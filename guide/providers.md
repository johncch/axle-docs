---
title: Providers
description: First-party providers and any OpenAI-compatible endpoint.
---

# Providers

Axle ships with first-party support for Anthropic, OpenAI, and Gemini, plus a
generic Chat Completions provider for any OpenAI-compatible API.

```typescript
import {
  anthropic,
  openai,
  gemini,
  chatCompletions,
} from "@fifthrevision/axle";

const a = anthropic(process.env.ANTHROPIC_API_KEY);
const o = openai(process.env.OPENAI_API_KEY);
const g = gemini(process.env.GEMINI_API_KEY);
const local = chatCompletions("http://localhost:11434/v1");
```

## Retry and timeout options

All provider factories accept an optional `ProviderClientOptions` object as
their second argument. Use `maxRetries` and `timeoutMs` to tune reliability:

```typescript
const provider = openai(apiKey, {
  maxRetries: 2,
  timeoutMs: 30_000,
});
```

- `maxRetries` — number of retry attempts **after** the first request. Defaults
  to `2`; set to `0` to disable retries.
- `timeoutMs` — request timeout in milliseconds. Omit to use the provider SDK
  default.

These options are available on every provider factory:
`anthropic()`, `openai()`, `gemini()`, and `chatCompletions()`.

## Anthropic

```typescript
const provider = anthropic(process.env.ANTHROPIC_API_KEY);

const agent = new Agent({
  provider,
  model: "claude-sonnet-4-5-20250929",
});
```

Supported models include the Claude 4 family (Opus 4.8, Opus 4.7, Sonnet 4.5,
Haiku 4.5) and the available Anthropic provider tools — see
[Provider Tools](/guide/provider-tools).

## OpenAI

```typescript
const provider = openai(process.env.OPENAI_API_KEY);

const agent = new Agent({
  provider,
  model: "gpt-4o-mini",
});
```

The OpenAI provider supports reasoning effort, structured output, and OpenAI's
built-in tools (web search, code interpreter).

## Gemini

```typescript
const provider = gemini(process.env.GEMINI_API_KEY);

const agent = new Agent({
  provider,
  model: "gemini-3.5-flash",
});
```

Supported models include `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`,
`gemini-3-flash-preview`, and other variants available
via the Gemini API. See the models export for the full list.

## Chat Completions (OpenAI-compatible)

Use any endpoint that speaks the OpenAI Chat Completions API — local LLMs via
Ollama, vLLM, llama.cpp, or third-party gateways.

```typescript
const provider = chatCompletions("http://localhost:11434/v1", {
  apiKey: "optional",
});

const agent = new Agent({ provider, model: "llama3" });
```

The legacy `chatCompletions(baseUrl, apiKey)` two-argument string form is still
supported.

### Vendor auto-detection

Axle recognizes the official OpenRouter and Together endpoint hostnames and
applies their request differences automatically. Set `vendor` explicitly only
when using a proxy or gateway with a different hostname:

```typescript
import { chatCompletions } from "@fifthrevision/axle";

// Auto-detected — no vendor option needed
const openRouter = chatCompletions("https://openrouter.ai/api/v1", {
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Proxy — vendor must be explicit
const viaProxy = chatCompletions("https://gateway.example.test/v1", {
  apiKey: process.env.OPENROUTER_API_KEY,
  vendor: "openrouter",
});
```

### OpenRouter

To use OpenRouter with provider-managed tools such as web search:

```typescript
const provider = chatCompletions("https://openrouter.ai/api/v1", {
  apiKey: process.env.OPENROUTER_API_KEY,
  // vendor: "openrouter" is auto-detected from the hostname
});

const agent = new Agent({
  provider,
  model: "openai/gpt-4o-search-preview",
  providerTools: [{ type: "provider", name: "web_search" }],
});
```

See [Provider Tools](/guide/provider-tools#openrouter-web-search) for full
details including result-count config and citation rendering.

### Together

```typescript
const provider = chatCompletions("https://api.together.ai/v1", {
  apiKey: process.env.TOGETHER_API_KEY,
  // vendor: "together" is auto-detected from the hostname
});
```

Together uses a vendor-specific reasoning shape and does not accept PDF file
inputs via the Chat Completions file part. See the [0.25.0 migration guide](/migration/0.25.0#together-chat-completions-vendor)
for details.

## Models export

Common model identifiers are also re-exported from `@fifthrevision/axle/models`
for convenience.
