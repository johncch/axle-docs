---
title: Reasoning models
description: Enabling thinking, rendering it, and preserving continuity across turns.
---

# Reasoning models

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";

const agent = new Agent({
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-opus-4-5",
  reasoning: true,
});

agent.on((event) => {
  switch (event.type) {
    case "part:start":
      if (event.part.type === "thinking") console.log("\n[thinking]");
      if (event.part.type === "text") console.log("\n[answer]");
      break;
    case "thinking:delta":
      process.stdout.write(event.delta);
      break;
    case "text:delta":
      process.stdout.write(event.delta);
      break;
  }
});

const result = await agent.send("Prove that the square root of 2 is irrational.").final;
console.log(`\nreasoning tokens: ${result.usage.reasoningOut ?? 0}`);
```

`reasoning` is a portable boolean that maps onto each provider's own controls.
Set it per agent, or per send when one question doesn't need it:

```typescript
await agent.send("Quick question.", { reasoning: false }).final;
```

For provider-specific knobs — thinking budgets, effort levels — use
`providerOptions`, which is applied after Axle's mapping and can override it:

```typescript
const agent = new Agent({
  provider,
  model,
  reasoning: true,
  providerOptions: { thinking: { type: "enabled", budget_tokens: 10_000 } },
});
```

Bear in mind that ties the agent to one provider, so keep it out of code you
want to stay portable.

As always, that switch is fine for a terminal. In a UI, apply the events to a
[`Transcript`](/concepts/transcripts) and render the `thinking` parts it
assembles.

## What you get back

Reasoning surfaces as `thinking` parts:

```typescript
interface ThinkingPart {
  id: string;
  type: "thinking";
  text?: string; // renderable reasoning, when the provider exposes it
  summary?: string; // provider-supplied summary
  redacted?: boolean; // provider withheld the content
  continuity?: ThinkingContinuity; // opaque state — preserve it
}
```

Your UI needs to handle three cases, and it's easiest to write all three up
front:

- **`text` present** — render it, usually collapsed by default.
- **`summary` present, no `text`** — some providers only expose a summary. Render
  that.
- **`redacted: true`** — the provider withheld the content for safety. Show that
  thinking happened; there is nothing to display.

```tsx
case "thinking":
  if (part.redacted) return <Note key={part.id}>Reasoning withheld</Note>;
  return (
    <details key={part.id}>
      <summary>Thinking</summary>
      <pre>{part.text ?? part.summary}</pre>
    </details>
  );
```

Summaries stream on their own channel, by the way — `thinking:summary-delta`
rather than `thinking:delta`.

## Continuity across turns

`continuity` is opaque provider state — an encrypted blob, a signature, a
thought signature — that lets a model continue reasoning across requests.

```typescript
type ThinkingContinuity =
  | { provider: "openai"; encrypted: string }
  | { provider: "anthropic"; signature?: string; redactedData?: string }
  | { provider: "gemini"; thoughtSignature: string };
```

Axle carries it through `agent.messages` automatically, so normally you never
think about it. But there are two places where **you** have to preserve it
verbatim:

- **Persistence.** If you serialize and restore sessions, do not strip it.
  `agent.snapshot()` keeps it; hand-rolled message filtering often does not.
- **Compaction.** A compactor that rewrites assistant messages must preserve
  `continuity` on any thinking part it keeps — or drop the whole part. Half a
  thinking part with a mangled signature is worse than none.

## Reasoning tokens and cost

```typescript
result.usage.reasoningOut; // included in usage.out — do not add it again
```

Reasoning tokens bill as output. A reasoning model can easily spend far more on
thinking than on the answer itself — which is why `maxOutputTokens` may need to
be much larger than the length of the answer would suggest. If a reasoning model
keeps truncating, that's usually the cause.

## Reasoning with tools

These compose naturally: the model thinks, calls tools, thinks about the
results, and answers. Each step can produce its own thinking part, and they all
accumulate into the same agent turn.

## Reasoning with structured output

This works, with one caveat worth knowing in advance: reasoning models are more
prone to prefixing their JSON with commentary. If parse errors climb after you
enable `reasoning`, restate the bare-JSON requirement in your system prompt, or
simplify the schema.

## Turning it off

Some models reason by default, which isn't always what you want.
`reasoning: false` turns it off wherever the provider supports that. It's worth
setting explicitly on latency-sensitive paths and on
[compaction](/concepts/compaction) calls — `PromptCompactor` already does the
latter for you.

## See also

- [Providers & models](/concepts/providers#request-options)
- [Messages & parts reference](/reference/messages#thinkingcontinuity)
