---
title: Provider Tools
description: Tools that execute on the LLM provider's side.
---

# Provider Tools

Provider tools are tools that execute on the LLM provider's side (e.g. web
search, code interpreter). Pass them via the `providerTools` option using
`{ type: "provider", name: "..." }`.

```typescript
import { Agent } from "@fifthrevision/axle";
import type { ExecutableTool, ProviderTool } from "@fifthrevision/axle";
import { z } from "zod";

const myTool: ExecutableTool = {
  name: "lookup",
  description: "Look up a value",
  schema: z.object({ key: z.string() }),
  async execute(input) { return "result"; },
};

const agent = new Agent({
  provider,
  model,
  tools: [myTool],
  providerTools: [{ type: "provider", name: "web_search" }],
});
```

## Common names

Axle maps common names to provider-specific identifiers automatically:

| Name             | Anthropic             | OpenAI               | Gemini          |
| ---------------- | --------------------- | -------------------- | --------------- |
| `web_search`     | `web_search_20250305` | `web_search_preview` | `googleSearch`  |
| `code_execution` | —                     | `code_interpreter`   | `codeExecution` |

You can also pass provider-specific names directly.

## Configuration

Use the optional `config` field for provider-specific options:

```typescript
{ type: "provider", name: "web_search", config: { max_results: 5 } }
```

## OpenRouter web search

The Chat Completions provider supports OpenRouter server tools when
`vendor: "openrouter"` is set at construction (auto-detected by default).
This lets the model decide whether and when to call web search rather than
always injecting results via the plugin path.

```typescript
import { Agent, chatCompletions } from "@fifthrevision/axle";

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

With optional config to limit result count:

```typescript
providerTools: [
  {
    type: "provider",
    name: "web_search",
    config: { max_results: 3 },
  },
],
```

Axle maps this to the OpenRouter server tool shape:

```json
{
  "type": "openrouter:web_search",
  "parameters": {
    "max_results": 3
  }
}
```

Function tools and OpenRouter server tools share the same `tools` array in the
Chat Completions request. Generic OpenAI-compatible endpoints still warn and
drop `providerTools` unless `vendor` is set.

Web search results from OpenRouter arrive as unanchored `CitationPart`s in the
turn — see [Streaming](/guide/streaming#citations) for how to render them.

## Web search fallback

When a provider does not natively support `web_search`, you can configure Axle
to execute web search on its own via a fallback backend. Call `configureAxle()`
once at startup, before creating any agents:

```typescript
import { configureAxle, braveWebSearch } from "@fifthrevision/axle";

configureAxle({
  webSearchFallback: braveWebSearch({ apiKey: process.env.BRAVE_API_KEY! }),
});
```

With this configured, any provider can use `web_search` — Axle runs the search
client-side and passes results back to the model as a tool result. A native
`web_search` on the provider always takes priority over the fallback.

`braveWebSearch()` wraps the Brave Search [LLM Context
API](https://api.search.brave.com/res/v1/llm/context) and accepts these
options:

```typescript
braveWebSearch({
  apiKey: string;        // required
  endpoint?: string;     // defaults to Brave's LLM Context endpoint
  maxResults?: number;   // 1–50, default 5
  maxTokens?: number;    // 1–32768, default 4096
  maxSnippets?: number;  // 1–256
  freshness?: "pd" | "pw" | "pm" | "py" | `${string}to${string}`;
  timeoutMs?: number;
  // ...additional options for result tuning
});
```

To build a custom fallback, implement the `WebSearchBackend` interface:

```typescript
import type { WebSearchBackend } from "@fifthrevision/axle";

const myBackend: WebSearchBackend = {
  name: "my-search",
  async search(request, context) {
    // request.query — the search string
    // context.signal — AbortSignal for cancellation
    // context.span — observability span
    return {
      results: [{ title: "...", url: "https://...", snippets: ["..."] }],
    };
  },
};
```

## Streaming events

Provider tool activity surfaces as `provider-tool:start` and
`provider-tool:complete` streaming events. See [Streaming](/guide/streaming).
