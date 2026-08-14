---
title: Provider tools
description: Hosted web search and code execution, and rendering their results.
---

# Provider tools

Provider tools run on the provider's own infrastructure. You name one, and
that's it — there's nothing to implement.

```typescript
import { Agent, anthropic, type ProviderTool } from "@fifthrevision/axle";

const webSearch: ProviderTool = { type: "provider", name: "web_search" };

const agent = new Agent({
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-sonnet-4-5",
  providerTools: [webSearch],
});

agent.on((event) => {
  switch (event.type) {
    case "part:start":
      if (event.part.type === "action" && event.part.kind === "provider-tool") {
        console.log(`\n[${event.part.detail.name}] searching…`);
      }
      break;
    case "text:delta":
      process.stdout.write(event.delta);
      break;
    case "text:citation":
      console.log(`\n[source] ${event.citation.source.type}`);
      break;
  }
});

const result = await agent.send("What are today's top news headlines?").final;
```

The event switch above is terminal-shaped. In a UI, apply events to a
[`Transcript`](/concepts/transcripts) and render the `provider-tool` action
parts it builds.

## Portable names

Axle maps two names to each vendor's native equivalent:

| Portable | Anthropic | OpenAI | Gemini |
| --- | --- | --- | --- |
| `web_search` | `web_search_20250305` | `web_search_preview` | `googleSearch` |
| `code_execution` | — | `code_interpreter` | `codeExecution` |

Anything else passes through untouched, so a vendor-specific tool works by
naming it directly:

```typescript
const custom: ProviderTool = { type: "provider", name: "computer_20250124" };
```

Note the gap in that table: Anthropic has no mapping for `code_execution`, so
the name goes through as-is and the request will fail unless Anthropic happens to
recognize it.

## Configuration is not portable

```typescript
const search: ProviderTool = {
  type: "provider",
  name: "web_search",
  config: { max_uses: 5 }, // Anthropic-shaped — not portable
};
```

`config` is raw passthrough. Field names and placement differ per vendor, so
anything you put here ties that agent to that provider — which is fine when
that's what you want, as long as you know you're doing it.

## Rendering citations

Search results usually arrive as citations, in two forms:

**Anchored** to a span of generated text, on the text part:

```typescript
case "text":
  return <Markdown text={part.text} citations={part.citations} />;
```

Each citation carries `outputSpan` with `start`/`end` offsets into the text —
that is how you underline the exact cited passage.

**Unanchored**, as their own ordered part — a source list:

```typescript
case "citation":
  return <SourceList citations={part.citations} />;
```

Source shapes vary:

```typescript
switch (citation.source.type) {
  case "web":
    return <a href={citation.source.url}>{citation.source.title ?? citation.source.url}</a>;
  case "document":
    return <DocRef title={citation.source.title} locator={citation.source.locator} />;
  case "search-result":
  case "retrieved-context":
  case "unknown":
    return <Generic citedText={citation.source.citedText} />;
}
```

Do handle `unknown`. Providers add source types faster than any normalizer keeps
up with them, and you don't want a new one crashing your renderer.

## Mixing with your own tools

Provider tools and your own executable tools live happily in the same registry:

```typescript
const agent = new Agent({
  provider,
  model,
  providerTools: [{ type: "provider", name: "web_search" }],
  tools: [myDatabaseTool],
});
```

Just keep the names unique across both.

## When the provider has no native support

Ask for `web_search` on a provider that doesn't have one and you'll get
`WEB_SEARCH_FALLBACK_NOT_CONFIGURED` — unless you've registered a fallback
backend, in which case Axle quietly substitutes a real executable tool. See
[Web search](/cookbook/web-search).

## See also

- [Tools](/concepts/tools#provider-tools)
- [Tools reference](/reference/tools#providertool)
- [Messages & parts reference](/reference/messages#citations)
