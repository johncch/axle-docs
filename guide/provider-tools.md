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

Provider-specific `config` only applies when the provider handles the tool
natively. When the fallback backend is selected, `config` is ignored (with a
warning) — configure behavior on `braveWebSearch()` instead.

## Web search fallback

`web_search` is native-first. When the provider supports native web search
(OpenAI, Anthropic, Gemini, OpenRouter with `providerToolVendor: "openrouter"`),
Axle sends the provider-native tool. For providers without native support
(generic Chat Completions), Axle exposes the configured fallback as an
executable `web_search` tool.

### Configure Brave Search

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

The bundled backend uses Brave Search's LLM Context endpoint. Each result
contains a title, URL, and query-relevant extracted passages:

```typescript
interface WebSearchResult {
  title: string;
  url: string;
  snippets: string[];
}
```

`configureAxle()` is process-wide. Axle snapshots the current configuration
when an operation starts, so changing it after a run begins has no effect.

### Fallback vs native events

Native provider search emits `provider-tool:start` and
`provider-tool:complete` events with provider-native citations. Fallback search
emits ordinary tool events (`tool:request`, `tool:exec-start`,
`tool:exec-complete`) — the same as any executable tool.

Consumers should accept either native citation/provider-tool activity **or**
a successful `web_search` tool result, depending on the selected provider.

### Custom search backends

Any `WebSearchBackend` can be installed:

```typescript
import { configureAxle } from "@fifthrevision/axle";
import type { WebSearchBackend } from "@fifthrevision/axle";

const searchBackend: WebSearchBackend = {
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

configureAxle({ webSearchFallback: searchBackend });
```

### Custom search behavior

If you want complete control over search execution, register an executable
`web_search` tool instead of requesting the provider tool:

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

The global fallback only applies to the portable provider-tool request. It does
not replace an explicitly registered executable tool.

## OpenRouter web search

The Chat Completions provider supports OpenRouter server tools when
`providerToolVendor: "openrouter"` is set at construction. This lets the model
decide whether and when to call web search rather than always injecting results
via the plugin path.

```typescript
import { Agent, chatCompletions } from "@fifthrevision/axle";

const provider = chatCompletions("https://openrouter.ai/api/v1", {
  apiKey: process.env.OPENROUTER_API_KEY,
  providerToolVendor: "openrouter",
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
drop `providerTools` unless `providerToolVendor: "openrouter"` is set.

Web search results from OpenRouter arrive as unanchored `CitationPart`s in the
turn — see [Streaming](/guide/streaming#citations) for how to render them.

## Streaming events

Provider tool activity surfaces as `provider-tool:start` and
`provider-tool:complete` streaming events. See [Streaming](/guide/streaming).

Fallback search produces ordinary tool events (`tool:*`) instead. Check the
selected provider to know which event path to expect.
