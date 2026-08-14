---
title: Web search
description: One web_search that works on every provider, native or not.
---

# Web search

`web_search` is a [provider tool](/cookbook/provider-tools) on Anthropic,
OpenAI, and Gemini. But on a local model or a plain OpenAI-compatible endpoint,
there's nothing native to call.

So Axle lets you register a fallback backend, and quietly substitutes a real
executable tool when it's needed. The upshot is that the same agent code runs
everywhere.

## Registering a fallback

```typescript
import { configureAxle, braveWebSearch, Agent } from "@fifthrevision/axle";

configureAxle({
  webSearchFallback: braveWebSearch({
    apiKey: process.env.BRAVE_API_KEY!,
    maxResults: 5,
    country: "US",
    freshness: "pw", // past week
  }),
});

const agent = new Agent({
  provider: chatCompletions("http://localhost:11434/v1"), // no native search
  model: "qwen3:32b",
  providerTools: [{ type: "provider", name: "web_search" }],
});

const result = await agent.send("What happened in the news this week?").final;
```

`configureAxle` is process-global and merges with anything you set before, so
call it once at startup and forget about it.

## How the substitution works

At each `generate()` / `stream()` call, Axle asks the provider to resolve
`web_search` to a native name.

- **Resolved** → the provider tool is used. The fallback is ignored entirely.
- **Unresolved, fallback registered** → Axle swaps in an executable `web_search`
  tool backed by your backend, and the model calls it like any other tool.
- **Unresolved, no fallback** → throws `AxleError` with code
  `WEB_SEARCH_FALLBACK_NOT_CONFIGURED`, carrying `details.provider` and
  `details.model`.

The nice property here is that the failure is loud and happens at call time. You
won't accidentally ship an agent that quietly can't search.

## What changes when it falls back

The behaviour isn't identical, and it's worth knowing which one you got:

| | Native provider tool | Fallback tool |
| --- | --- | --- |
| Renders as | `provider-tool` action part | `tool` action part |
| Citations | Provider-supplied, often anchored to text spans | None — results are JSON in the tool result |
| Cost | Provider's search pricing | Your search API, plus tokens for the results |
| Latency | Inside the provider's request | An extra round trip |

One practical consequence: if your UI keys off `part.kind === "provider-tool"`
to show a search indicator, remember to add the `tool` case too, or search will
look invisible on fallback providers.

## The generated tool

- Name: `web_search`
- Input: `{ query: string }`, trimmed, 1–400 characters
- Output: JSON `{ query, results }` where each result is
  `{ title, url, snippets }`

## Brave options

```typescript
interface BraveWebSearchOptions {
  apiKey: string;
  endpoint?: string;
  maxResults?: number;
  candidateCount?: number;
  maxTokens?: number;
  maxSnippets?: number;
  maxTokensPerUrl?: number;
  maxSnippetsPerUrl?: number;
  contextThresholdMode?: string;
  country?: string;
  searchLanguage?: string;
  freshness?: "pd" | "pw" | "pm" | "py" | `${string}to${string}`;
  timeoutMs?: number;
}
```

`freshness` takes `pd` (day), `pw` (week), `pm` (month), `py` (year), or a
`START` to `END` date range.

Do pay attention to the token and snippet caps. Search results are verbose, and
an uncapped result set can eat a large share of your context window in a single
tool call.

## A custom backend

Any search API works — you just implement two members:

```typescript
import { configureAxle, type WebSearchBackend } from "@fifthrevision/axle";

const myBackend: WebSearchBackend = {
  name: "internal-docs",
  async search({ query }, { signal, span }) {
    span?.setAttribute("index", "docs-v2");
    const hits = await searchIndex(query, { signal });
    return {
      results: hits.map((h) => ({
        title: h.title,
        url: h.url,
        snippets: h.passages,
      })),
    };
  },
};

configureAxle({ webSearchFallback: myBackend });
```

This is also how you point `web_search` at an internal corpus rather than the
public web. Your agent code doesn't change at all — only what "search" means.

Do forward `signal`, so a cancelled send doesn't leave a search running.

## See also

- [Provider tools](/cookbook/provider-tools)
- [Configuration reference](/reference/configuration#websearchfallback)
- [Tools reference](/reference/tools#web-search)
