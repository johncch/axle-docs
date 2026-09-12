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
  reasoning: "on",
});

agent.on((event) => {
  switch (event.type) {
    case "part:start":
      if (event.part.type === "thinking") console.log("\n[thinking]");
      if (event.part.type === "text") console.log("\n[answer]");
      break;
    case "thinking:raw-delta":
      process.stdout.write(event.delta);
      break;
    case "thinking:summary-delta":
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

`reasoning` is a portable setting that maps onto each provider's own controls —
a named effort level plus a disclosure choice:

```typescript
type ReasoningEffort = "low" | "medium" | "high";
type ReasoningDisplay = "visible" | "hidden";
type ReasoningSetting = "default" | "off" | "on" | { effort: ReasoningEffort; display?: ReasoningDisplay };
```

- `"default"` (or omitted) sends no reasoning fields; the model runs at its
  provider's own default, which may be thinking-on or thinking-off.
- `"on"` is `{ effort: "medium" }` — a moderate choice. Reach for
  `{ effort: "high" }` on purpose when you want the deepest thinking.
- `"off"` sends the provider's explicit disable shape. Some always-thinking
  models reject it; the provider error surfaces unchanged.
- `{ effort }` picks a named level.
- `{ effort, display: "hidden" }` keeps thinking out of the turn while the
  message still carries whatever the wire returned, so provider continuity
  keeps working. See [Disclosure vs form](#disclosure-vs-form).

Set it per agent, or per send when one question doesn't need it:

```typescript
await agent.send("Quick question.", { reasoning: "off" }).final;
await agent.send("Think, but keep it out of the transcript.", { reasoning: { effort: "high", display: "hidden" } }).final;
```

For provider-specific knobs — thinking budgets, effort levels — use
`providerOptions`, which is applied after Axle's mapping and can override it:

```typescript
const agent = new Agent({
  provider,
  model,
  reasoning: "on",
  providerOptions: { thinking: { type: "enabled", budget_tokens: 10_000 } },
});
```

Bear in mind that ties the agent to one provider, so keep it out of code you
want to stay portable. On Anthropic, overriding the whole `thinking` object
replaces it — `type` included — so restate the fields you still want.

As always, that switch is fine for a terminal. In a UI, apply the events to a
[`Transcript`](/concepts/transcripts) and render the `thinking` parts it
assembles.

## Disclosure vs form

`display` says whether the provider should show its thinking. It never decides
*in what form* thinking arrives — that part is the model's, and the thinking
part records which one showed up.

Enabling reasoning (`"on"` or `{ effort }`) now asks for disclosure wherever a
request field exists: Anthropic gets `display: "summarized"`, OpenAI gets
`summary: "auto"`, Gemini gets `includeThoughts: true`. Which means Claude and
OpenAI models that previously streamed no thinking now stream it — and time to
first text token on Anthropic rises, since thinking tokens arrive first.

If that's not what you want, opt out per request:

```typescript
await agent.send("...", { reasoning: { effort: "high", display: "hidden" } }).final;
```

`"hidden"` sends the provider's own hide value on the same routes (`omitted` on
Anthropic, no summary field on OpenAI, `includeThoughts: false` on Gemini,
`reasoning: { exclude: true }` on OpenRouter) and withholds thinking content
from the turn on every route. Generic chat-completions endpoints and Together
have no field and send nothing either way. `"default"` and `"off"` are
unchanged and send nothing for display.

Fine-grained values stay in `providerOptions`: OpenAI `concise` and `detailed`
summaries, Anthropic's `updates` display.

## What you get back

Reasoning surfaces as `thinking` parts. Each content field is named for what
the provider handed back — and neither present is the withheld state:

```typescript
interface ThinkingPart {
  id: string;
  type: "thinking";
  summary?: string; // the provider's condensed account of its reasoning
  raw?: string; // the chain of thought itself; open-weight models only
  continuity?: ThinkingContinuity; // opaque state — preserve it
}
```

Your UI needs to handle two cases, and it's easiest to write both up front:

- **`summary` present** — the provider's condensed account. Render it, usually
  collapsed by default. This is what Anthropic, OpenAI, and Gemini return.
- **`raw` present** — the chain of thought itself, from open-weight models
  through OpenAI's `gpt-oss` and chat-completions endpoints. Render it the same
  way.

```tsx
case "thinking":
  if (!part.summary && !part.raw) return <Note key={part.id}>Reasoning withheld</Note>;
  return (
    <details key={part.id}>
      <summary>Thinking</summary>
      <pre>{part.summary ?? part.raw}</pre>
    </details>
  );
```

A part opens with no content field; a field appears only once a delta wrote it.
So render `summary ?? raw` and never test for `""`.

Summaries and raw text stream on separate channels — `thinking:summary-delta`
and `thinking:raw-delta` — because a part can receive both kinds of delta. Some
providers (OpenAI's reasoning models, DeepSeek) give you the raw thinking text;
others (OpenRouter's hosted reasoning models, Gemini) expose only a summary. On
OpenRouter, Claude summaries stream as summary deltas — they used to land in the
raw channel, and no longer do — so handle both events even if you're only used
to one.

One vocabulary note: the message-layer thinking part (`ContentPartThinking` on
`AxleMessage`) keeps the wire vocabulary — `text`, `summary`, `redacted` —
because it exists to be echoed back to the provider, not read. `redacted` there
means only that the provider substituted an opaque payload (Anthropic
`redacted_thinking`, OpenRouter `reasoning.encrypted`); a merely hidden block is
not marked redacted. Read the turn part, echo the message part.

## Continuity across turns

`continuity` is opaque provider state — an encrypted blob, a signature, a
thought signature — that lets a model continue reasoning across requests.

```typescript
type ThinkingContinuity =
  | { provider: "openai"; encrypted: string }
  | { provider: "anthropic"; signature?: string; redactedData?: string }
  | { provider: "gemini"; thoughtSignature: string }
  | {
      provider: "openrouter";
      type: string;
      id?: string;
      format?: string;
      index?: number;
      signature?: string;
      data?: string;
    };
```

Axle carries it through `agent.messages` automatically, so normally you never
think about it. Claude through OpenRouter is worth knowing about: OpenRouter's
`reasoning_details` are read and echoed back on assistant messages, so summaries
render as summaries and multi-turn tool loops keep their signatures. But there
are two places where **you** have to preserve it verbatim:

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
`reasoning: "off"` turns it off wherever the provider supports that — it sends
the provider's explicit disable shape rather than just omitting the field, so
a model that thinks by default actually stops. It's worth setting explicitly on
latency-sensitive paths — and on
[compaction](/concepts/compaction) calls, where `PromptCompactor` leaves
`reasoning` unset by default (so the model follows its own default). If you
*do* want a reasoning model to drive the summary, pass an explicit setting such
as `reasoning: "on"` (and `providerOptions` for the provider-specific knobs)
when you construct the compactor — it's opt-in, because a cheap summary rarely
benefits from the extra latency.

## See also

- [Providers & models](/concepts/providers#request-options)
- [Messages & parts reference](/reference/messages#thinkingcontinuity)
