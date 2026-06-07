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

Config is a provider-specific passthrough — field names and placement differ
across providers:

| Provider                     | Example config fields                                |
| ---------------------------- | ---------------------------------------------------- |
| OpenAI                       | `search_context_size`, `user_location`               |
| Anthropic                    | `max_uses`, `allowed_domains`, `blocked_domains`     |
| OpenRouter server tool       | `max_results`, `allowed_domains`, `excluded_domains` |

## OpenRouter web search

The Chat Completions provider can route provider tools to OpenRouter server
tools. Pass `providerToolVendor: "openrouter"` when constructing the provider:

```typescript
import { Agent, chatCompletions } from "@fifthrevision/axle";

const provider = chatCompletions("https://openrouter.ai/api/v1", {
  apiKey: process.env.OPENROUTER_API_KEY,
  providerToolVendor: "openrouter",
});

const agent = new Agent({
  provider,
  model: "openai/gpt-4o-search-preview",
  providerTools: [
    {
      type: "provider",
      name: "web_search",
      config: { max_results: 3 },
    },
  ],
});
```

Axle maps this to an OpenRouter server tool in the request:

```json
{
  "type": "openrouter:web_search",
  "parameters": {
    "max_results": 3
  }
}
```

Generic OpenAI-compatible Chat Completions providers warn and drop
`providerTools` unless `providerToolVendor: "openrouter"` is set.

### Citations from web search

When OpenRouter web search returns sources, Axle surfaces them as `citation`
parts alongside the assistant text — not as inline `text:citation` events.
Render them by handling `part.type === "citation"` in your turn loop:

```typescript
for (const part of turn.parts) {
  if (part.type === "text") {
    renderText(part.text);
    renderInlineCitations(part.citations ?? []);
  }

  if (part.type === "citation") {
    renderSources(part.citations);
  }
}
```

See the [0.22.0 migration guide](/migration/0.22.0) for full details on the
`citation` part type.

## Streaming events

Provider tool activity surfaces as `provider-tool:start` and
`provider-tool:complete` streaming events. See [Streaming](/guide/streaming).
