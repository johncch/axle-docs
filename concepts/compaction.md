---
title: Compaction
description: Trading a long conversation for a shorter one, without losing what the reader sees.
---

# Compaction

::: warning Experimental
Compaction is still under active design and may change in any release. It was
restructured in 0.30.0. Everything here is accurate for 0.30.1, but do check the
changelog when you upgrade.
:::

Eventually a conversation gets too long for the model's context window.
Compaction is the answer: it swaps the active conversation for a condensed
rewrite. The old messages stop existing for the model, while your
[transcript](/concepts/transcripts) keeps a `compaction` part marking where it
happened — so your user still sees a coherent history.

## Three layers, three jobs

Compaction is split so each piece answers exactly one question:

| Layer | Question |
| --- | --- |
| `triggers` | When should we *consider* compacting automatically? |
| `shouldCompactOnTrigger` | This trigger fired — should we actually do it? |
| `compact` | Produce the new conversation. |

```typescript
agent.setCompaction({
  triggers: { beforeTurn: true },
  shouldCompactOnTrigger: (state, ctx) => ctx.usage.total > 100_000,
  compact: async (state, ctx) => {
    const summary = await summarize(state.messages);
    return {
      messages: [{ role: "user", content: summary }],
      summary: "Summarized the earlier conversation.",
    };
  },
});
```

Calling `setCompaction` again replaces the whole configuration.

## The built-in compactor

You probably don't want to write your own on day one. `PromptCompactor` handles
both the policy and the work — it uses a model to summarize, keeps recent user
messages verbatim, and reports progress while it runs.

```typescript
import { PromptCompactor } from "@fifthrevision/axle";

const compactor = new PromptCompactor({
  provider,
  model: "claude-haiku-4-5",
  prompt: "Summarize this conversation, preserving decisions and open questions.",
  thresholdTokens: 100_000,
  targetTokens: 20_000,
  recentUserMessages: 10,
});

agent.setCompaction({
  compact: compactor.compact,
  shouldCompactOnTrigger: compactor.shouldCompactOnTrigger,
  triggers: { beforeTurn: true },
});
```

Use a cheap, fast model here — summarization doesn't need your best one. The
compactor treats the transcript it's summarizing as untrusted data and says so in
its own system prompt, which matters if that conversation contains anything a
user or a tool put there.

`targetTokens` budgets the whole replacement, including the verbatim recent-user-message
appendix. If you set it too small relative to `recentUserMessages`, it throws
rather than silently truncating something important.

## Triggers

| Trigger | Fires |
| --- | --- |
| `beforeTurn` | After the user message commits, before the provider request |
| `afterTurn` | After the response is parsed, at the end of the send |
| manual | Whenever you call `agent.compact()` |

`beforeTurn` is usually what you want — it keeps the *next* request inside
budget. `afterTurn` compacts eagerly so the cost lands after your user already
has their answer, which can feel snappier.

`agent.compact()` skips `shouldCompactOnTrigger` entirely. If you asked for it
explicitly, Axle does it.

```typescript
const applied = await agent.compact(); // false if no config is registered
```

::: danger Don't await compact() from inside a send
Like `snapshot()`, it queues behind in-flight work and will deadlock if you call
it from a tool's `execute` or from a compaction callback.
:::

## Writing your own compactor

```typescript
const compact: CompactionCallback = async (state, ctx) => {
  ctx.usage; // ContextUsage before compaction
  ctx.trigger; // "manual" | "beforeTurn" | "afterTurn"
  ctx.signal; // abort signal
  ctx.id; // this compaction's id — the emitted part shares it
  ctx.emit({ progress: 0.5, summary: "Summarizing…" });

  return { messages: newMessages, summary: "Compacted 40 messages." };
};
```

Four things that are easy to get wrong the first time:

- **Return the complete new conversation**, not a delta. What you return *becomes*
  `agent.messages`.
- **There's no decline path.** Declining automatic work is
  `shouldCompactOnTrigger`'s job. Failures throw.
- **`summary` is a presentation choice**, independent of the messages you return.
  It can be the summary text, or `"Reduced context by 50%"`, or nothing at all.
  Omit it and the last emitted transient summary stands; with none at all, the
  part renders as a bare divider.
- **`shouldCompactOnTrigger` has to be synchronous and cheap.** It runs at every
  configured boundary.

### Your messages have to stand alone

Axle validates what you return before applying it, because providers reject
malformed conversations:

- Every tool call must be answered by the tool message immediately after it, with
  nothing interleaved.
- Every tool result must answer a preceding call.
- No unanswered tool calls at the end.

Violations throw `AxleError` with code `COMPACTION_INVALID_MESSAGES`, and nothing
gets applied. In practice this means one rule: when you truncate, cut at a clean
turn boundary, never in the middle of a tool exchange.

### Recognizing your own output

Stamp the messages you emit, so a later run can tell which part of the
conversation is already-compacted output:

```typescript
import { getCompactionStamp, type CompactionCallback } from "@fifthrevision/axle";

const compact: CompactionCallback = async (state, context) => {
  // Skip anything a previous run of this compactor already produced.
  const fresh = state.messages.filter((message) => !getCompactionStamp(message));

  return {
    messages: [
      {
        role: "user",
        content: await summarize(fresh),
        metadata: { axleCompaction: { id: context.id, role: "summary" } },
      },
    ],
  };
};
```

`PromptCompactor` uses this to avoid summarizing its own summaries — which
otherwise degrades badly over a long session.

## What your user sees

Compaction is ordinary, fallible turn work, streamed like a tool call. It lands
in whatever turn context is natural:

- `beforeTurn` → at the head of that send's agent turn
- `afterTurn` → at the tail
- `manual` → in its own engine-opened turn

The part moves from `running` to `complete` or `error`. A compaction that
`shouldCompactOnTrigger` declined never appears at all.

A settled `complete` part means the message swap applied, atomically. An `error`
part records a failed attempt — and importantly, that's **non-fatal for automatic
triggers**: the send carries on with the conversation uncompacted. A failed
manual `compact()` rejects, since you asked for it directly.

## Cancelling mid-compaction

Cancelling during `beforeTurn` compaction does **not** unwind the transcript. The
user message is already committed, compaction is work inside that open turn, and
the turn simply gets marked cancelled. See
[Agent](/concepts/agent#interrupting-three-different-things).

## Next

- [Sessions & persistence](/concepts/sessions)
- [Turns & Transcripts](/concepts/transcripts)
- [Configuration reference](/reference/configuration)
