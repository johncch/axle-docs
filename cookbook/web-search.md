---
title: Web search
description: One web_search that works on every provider, native or attached.
---

# Web search

`web_search` is a [provider tool](/cookbook/provider-tools) on Anthropic,
OpenAI, and Gemini. But on a local model or a plain OpenAI-compatible endpoint,
there's nothing native to call.

So Axle lets you attach a search tool to the `chatCompletions()` provider that
needs one, and the same agent code runs everywhere.

## Attaching a search

```typescript
import { chatCompletions, braveWebSearch, Agent } from "@fifthrevision/axle";

const provider = chatCompletions("http://localhost:11434/v1", {
  webSearch: braveWebSearch({
    apiKey: process.env.BRAVE_API_KEY!,
    maxResults: 5,
    country: "US",
    freshness: "pw", // past week
  }),
});

const agent = new Agent({
  provider, // no native search
  model: "qwen3:32b",
  providerTools: [{ type: "provider", name: "web_search" }],
});

const result = await agent.send("What happened in the news this week?").final;
```

The request still names `web_search` as a provider tool. When the provider sees
it, it sends the attached tool to the model as an ordinary function tool and
drops `web_search` from the provider tools it translates — the loop then runs
it as an ordinary tool call. What a provider can do is fixed when the provider
is constructed, so two providers in one process can serve the same name
differently.

## How the serving works

Each provider decides how to serve a provider-tool name: as a tool the vendor
hosts, as an executable tool the provider brings, or not at all.

- **Hosted** (Anthropic, OpenAI, Gemini) → the provider tool is used. No
  attached tool is involved.
- **Attached** (`chatCompletions()` with `webSearch`) → the attached tool runs
  as an ordinary tool call. This wins wherever it is attached — including on
  OpenRouter, which hosts a search of its own. Don't attach one if you want
  OpenRouter's.
- **Neither** → the request fails before anything is sent: `ok: false` with
  `error.kind` `"model"` and a message naming the tool. There is no error code.

The nice property here is that the failure is loud. You won't accidentally ship
an agent that quietly can't search.

## What changes when it's attached

The behaviour isn't identical, and it's worth knowing which one you got:

| | Native provider tool | Attached tool |
| --- | --- | --- |
| Renders as | `provider-tool` action part | `tool` action part |
| Citations | Provider-supplied, often anchored to text spans | None — results are JSON in the tool result |
| Cost | Provider's search pricing | Your search API, plus tokens for the results |
| Latency | Inside the provider's request | An extra round trip |

One practical consequence: if your UI keys off `part.kind === "provider-tool"`
to show a search indicator, remember to add the `tool` case too, or search will
look invisible on attached providers.

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

## A custom search tool

Any search API works — you just write an `ExecutableTool` named `web_search`
whose `execute` returns the results as a string, and attach it as `webSearch`:

```typescript
import { chatCompletions, type ExecutableTool } from "@fifthrevision/axle";
import * as z from "zod";

declare const searchIndex: (query: string, signal: AbortSignal) => Promise<{ title: string; url: string; passages: string[] }[]>;

const internalSearchSchema = z.object({ query: z.string().trim().min(1).max(400) });

const internalSearch: ExecutableTool<typeof internalSearchSchema> = {
  name: "web_search",
  description: "Search the internal docs index for current information.",
  schema: internalSearchSchema,
  async execute({ query }, { signal }) {
    const hits = await searchIndex(query, signal);
    return JSON.stringify({
      query,
      results: hits.map((h) => ({ title: h.title, url: h.url, snippets: h.passages })),
    });
  },
};

const provider = chatCompletions("http://localhost:11434/v1", {
  webSearch: internalSearch,
});
```

This is also how you point `web_search` at an internal corpus rather than the
public web. Your agent code doesn't change at all — only what "search" means.

Do forward `signal`, so a cancelled send doesn't leave a search running.

## See also

- [Provider tools](/cookbook/provider-tools)
- [Providers reference](/reference/providers#websearch)
- [Tools reference](/reference/tools#web-search)
