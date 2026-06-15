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

| Name             | Anthropic             | OpenAI               | Gemini          | OpenRouter                |
| ---------------- | --------------------- | -------------------- | --------------- | ------------------------- |
| `web_search`     | `web_search_20250305` | `web_search_preview` | `googleSearch`  | `openrouter:web_search`   |
| `code_execution` | —                     | `code_interpreter`   | `codeExecution` | —                         |

You can also pass provider-specific names directly.

## Configuration

Use the optional `config` field for provider-specific options:

```typescript
{ type: "provider", name: "web_search", config: { max_results: 5 } }
```

When the web search fallback backend is active, provider-specific `config` is
ignored and Axle emits a warning. Configure fallback behavior on
`braveWebSearch()` instead.

## Web Search Fallback

Axle treats `providerTools: [{ type: "provider", name: "web_search" }]` as a
portable capability request. If the selected provider does not natively support
`web_search`, Axle can use a process-wide fallback backend.

### Brave Search

Configure the fallback once during application startup:

```typescript
import { braveWebSearch, configureAxle } from "@fifthrevision/axle";

configureAxle({
  webSearchFallback: braveWebSearch({
    apiKey: process.env.BRAVE_API_KEY!,
    maxResults: 5,
    maxTokens: 4_096,
  }),
});
```

The backend uses Brave's [LLM Context
endpoint](https://api.search.brave.com/app/documentation/llm-context), which
returns query-relevant extracted passages rather than traditional search
result descriptions.

Available options:

```typescript
interface BraveWebSearchOptions {
  apiKey: string;
  endpoint?: string;
  maxResults?: number;     // final source URL limit, 1-50, default 5
  candidateCount?: number; // search candidates considered, 1-50
  maxTokens?: number;      // total context budget, default 4,096, max 32,768
  maxSnippets?: number;    // total passage count, max 256
  maxTokensPerUrl?: number;     // max 8,192
  maxSnippetsPerUrl?: number;   // max 100
  contextThresholdMode?: string;
  country?: string;
  searchLanguage?: string;
  freshness?: "pd" | "pw" | "pm" | "py" | `${string}to${string}`;
  timeoutMs?: number;
}
```

### Custom fallback backend

Any backend implementing the `WebSearchBackend` interface can be installed:

```typescript
import { configureAxle } from "@fifthrevision/axle";
import type { WebSearchBackend } from "@fifthrevision/axle";

const backend: WebSearchBackend = {
  name: "internal-search",
  async search({ query }, { signal }) {
    const matches = await searchInternalIndex(query, { signal });
    return {
      results: matches.map((m) => ({
        title: m.title,
        url: m.url,
        snippets: m.passages,
      })),
    };
  },
};

configureAxle({ webSearchFallback: backend });
```

Each result has a `title`, `url`, and an array of relevant `snippets`. Axle
handles tool schema, execution events, and result serialization.

### Resolution order

When an operation starts, Axle resolves `web_search` as follows:

1. If the provider natively supports `web_search`, Axle sends the
   provider-native tool.
2. Otherwise, Axle exposes the configured fallback as an executable
   `web_search` tool.
3. If neither is available, Axle fails before sending the model request with
   `WEB_SEARCH_FALLBACK_NOT_CONFIGURED`.

OpenAI, Anthropic, Gemini, and OpenRouter retain their native search paths.
Axle auto-detects OpenRouter from the official endpoint hostname.

### Native vs. fallback events

Native provider search emits provider-managed content and events:

- `provider-tool:start`
- `provider-tool:complete`
- provider-native citation parts or text citations

Fallback search is an ordinary Axle tool call and emits:

- `tool:request`
- `tool:exec-start`
- `tool:exec-complete`
- a normal tool-result message

Accept either native citation/provider-tool activity or a successful
`web_search` tool result as proof that search ran.

### Custom search behavior

To own search execution entirely, register an executable `web_search` tool and
omit the provider tool:

```typescript
const webSearch = {
  name: "web_search",
  description: "Search the public web",
  schema: z.object({ query: z.string() }),
  async execute({ query }) {
    return await searchWithMyBackend(query);
  },
};

const agent = new Agent({
  provider,
  model,
  tools: [webSearch],
});
```

The global fallback only applies to the portable provider-tool request — it
does not replace an explicitly registered executable tool.

## OpenRouter web search

The Chat Completions provider supports OpenRouter server tools via the
`vendor` option. Axle auto-detects the official OpenRouter endpoint hostname
and sets the vendor automatically. Set `vendor: "openrouter"` explicitly only
when routing through a proxy or gateway:

```typescript
import { Agent, chatCompletions } from "@fifthrevision/axle";

const provider = chatCompletions("https://openrouter.ai/api/v1", {
  apiKey: process.env.OPENROUTER_API_KEY,
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
drop `providerTools` unless a vendor that supports provider tools is detected
or set.

Web search results from OpenRouter arrive as unanchored `CitationPart`s in the
turn — see [Streaming](/guide/streaming#citations) for how to render them.

## Streaming events

Provider tool activity surfaces as `provider-tool:start` and
`provider-tool:complete` streaming events. See [Streaming](/guide/streaming).
Fallback web search produces ordinary `tool:*` events instead.