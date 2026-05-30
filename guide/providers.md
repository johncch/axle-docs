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
  model: "gpt-5-mini",
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

Supported models include `gemini-2.5-flash`, `gemini-2.5-pro`,
`gemini-3.5-flash`, `gemini-3-flash-preview`, and other variants available
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

## Retry and timeout options

All provider factories accept portable client options for reliability tuning:

```typescript
const provider = anthropic(process.env.ANTHROPIC_API_KEY, {
  maxRetries: 2,
  timeoutMs: 30_000,
});
```

The same options work for all providers:

```typescript
openai(apiKey, { maxRetries: 3, timeoutMs: 60_000 });
gemini(apiKey, { maxRetries: 2 });
chatCompletions(baseUrl, { maxRetries: 1, timeoutMs: 15_000 });
```

- `maxRetries` — number of retry attempts after the first request. Set `0` to
  disable retries entirely.
- `timeoutMs` — request timeout in milliseconds (must be a positive integer).

OpenAI, Anthropic, and Gemini map these to their respective SDK client options.
The Chat Completions provider uses Axle's internal retry wrapper.

## Models export

Common model identifiers are also re-exported from `@fifthrevision/axle/models`
for convenience.
