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

### OpenRouter

To use OpenRouter with provider-managed tools such as web search, set
`vendor: "openrouter"`. Axle auto-detects OpenRouter from the hostname, so in
most cases this is optional. When set explicitly it enables Axle to translate
`providerTools` into OpenRouter server tools:

```typescript
const provider = chatCompletions("https://openrouter.ai/api/v1", {
  apiKey: process.env.OPENROUTER_API_KEY,
  vendor: "openrouter",
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

Axle auto-detects the Together API (`https://api.together.ai/v1`) and
translates `reasoning` into Together's native format (`reasoning.enabled`).
PDF file parts are not supported by Together and will throw.

```typescript
const provider = chatCompletions("https://api.together.ai/v1", {
  apiKey: process.env.TOGETHER_API_KEY,
});
```

## Models export

Model constants and metadata are available from the dedicated entry point
`@fifthrevision/axle/models`. They use publisher-qualified IDs:

```typescript
import { ModelInfo, Models } from "@fifthrevision/axle/models";

const model = Models.OpenAI.GPT_5_4_MINI;  // "openai/gpt-5.4-mini"
const limits = ModelInfo[model];
// { contextWindow: ..., maxOutputTokens: ..., multimodal: true }
```

Publisher-qualified IDs are accepted by first-party providers (the publisher
prefix is stripped before sending to the SDK), and unqualified IDs continue to
work for direct use:

```typescript
const agent = new Agent({
  provider: openai(apiKey),
  model: Models.OpenAI.GPT_5_4_MINI,  // "openai/gpt-5.4-mini" — SDK receives "gpt-5.4-mini"
});

// Or pass a bare string directly:
const agent2 = new Agent({
  provider: openai(apiKey),
  model: "gpt-4.1",
});
```

`Models` is organized by publisher — `Models.OpenAI`, `Models.Anthropic`,
`Models.Google`, `Models.DeepSeek`, `Models.Mistral`, `Models.Qwen`,
`Models.MiniMax`, `Models.Moonshot`, and `Models.ZAI`. The `ModelInfo` record
provides context window, max output tokens, and multimodal support for any
registered model.

Chat Completions endpoints do not strip the publisher prefix — send the model
ID that your endpoint expects:
