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
`vendor: "openrouter"` is set at construction. Axle auto-detects OpenRouter's
official hostname; the explicit `vendor` option is needed only for proxies
and gateways. This lets the model decide whether and when to call web search
rather than always injecting results via the plugin path.

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
drop `providerTools` unless `vendor: "openrouter"` is set.

Web search results from OpenRouter arrive as unanchored `CitationPart`s in the
turn — see [Streaming](/guide/streaming#citations) for how to render them.

## Streaming events

Provider tool activity surfaces as `provider-tool:start` and
`provider-tool:complete` streaming events. See [Streaming](/guide/streaming).
