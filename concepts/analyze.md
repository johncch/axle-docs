---
title: Analyzing a conversation
description: Reading stored turns with analyze() — segments, predicates, and simplifying helpers.
---

# Analyzing a conversation

::: warning Experimental
`@fifthrevision/axle/analyze` is experimental and may change in a minor release.
:::

Once a run is over, the turns you saved know everything about what happened —
what failed, what the model recovered from, how the conversation ended. But
turns are shaped for rendering, not for counting. `analyze()` re-reads them
into **segments**: plain data that says what happened and where, with no
content attached.

```typescript
import { analyze, byAgent, failed, named, streaks } from "@fifthrevision/axle/analyze";

const a = analyze(transcript.turns);

a.tools.filter(failed); // tool calls that errored
a.tools.some(named("read-file")); // did it ever call read-file?
a.errors.filter((e) => e.recovered); // errors the model got past by itself
a.turns.filter((t) => t.rescue).length; // user turns that followed a failed turn
streaks(a.turns.filter(byAgent), failed); // runs of failed turns
```

`analyze()` takes `Transcript.turns` — from a live transcript or from storage —
and returns six lists of segments in the order things happened. For one send,
`analyze([result.turn])` reads the agent turn the send resolved with, no
`Transcript` attached.

## What a segment is

One piece of the conversation: a turn, a tool call, a subagent call, a
compaction, or a piece of text the agent wrote. It says what happened and
where, and carries no content.

| List | Holds |
| --- | --- |
| `turns` | the user and agent turns |
| `tools` | tool calls: ordinary, deferred, and provider tools |
| `subagents` | subagent calls, each with the same six lists for its own run |
| `compactions` | compaction attempts |
| `texts` | the pieces of text the agent wrote, as a length |
| `errors` | every segment that failed, of any kind |

A turn segment carries the same lists for that turn, with `parts` (its segments
in order) in place of `turns`. The same segment is one object wherever you
reach it: `a.tools[0]`, its turn's `parts` entry, and — if it failed — its
`a.errors` entry are identical.

Every segment has `turnId`, `turnIndex`, and `depth`, and a part segment has
`partId`. The fields worth knowing:

- **`status`** — the turn's or part's own status. `failed`, `completed`, and
  `cancelled` read it.
- **`error`** — `{ type, message, code? }` on a segment that failed. On a turn,
  `type` is the failure kind (`api`, `incomplete`, `refusal`, `parse`) or
  `thrown`; on a tool call it is the tool error type.
- **`recovered`** — on a failed segment, whether the turn it happened in went
  on to complete.
- **`rescue`** — on a user turn, whether the turn before it was a failed agent
  turn.
- **`cancelled`** — on a cancelled turn, `"timeout"` or `"user"`.
- **`tokens`, `ms`** — a turn's usage and duration. A tool call has `ms`, and
  a text segment has `chars`.
- **`name`, `parameters`** — on tool and subagent calls. A deferred tool call
  also has `callId`.
- **`threadId`** — on a user turn a continuation sent inline.

## Asking questions

The JavaScript array methods are the query language. The predicates are named
filters to pass to them: `failed`, `completed`, `cancelled`, `byUser`,
`byAgent`, and `named(name)`. Five functions cover what a filter can't:

| Function | Returns |
| --- | --- |
| `streaks(list, predicate)` | runs of two or more consecutive matches |
| `repeats(list)` | groups of the same call or the same error made more than once |
| `sum(list, pick)` | a total, such as `sum(a.turns.filter(failed), (t) => t.ms)` |
| `flatten(analysis)` | the same lists with every subagent's segments folded in, told apart by `depth` |
| `partOf(turns, segment)` | the original turn or part, for when you need the content |

Subagents are kept apart: `a.tools` is what this agent called, and
`a.subagents[0].tools` is what that subagent called. `flatten(a)` merges them —
a turn's `tokens` already include its subagents' usage, so `flatten` leaves
`turns` as the top-level turns.

```typescript
import { failed, flatten, partOf } from "@fifthrevision/axle/analyze";

const all = flatten(a);
const rows = all.tools.filter(failed).map((call) => ({
  tool: call.name,
  type: call.error?.type,
  message: call.error?.message,
  recovered: call.recovered,
}));

const part = partOf(transcript.turns, a.tools[0]); // the full part, with its result
```

## Reading instead of counting

`simplify()` is the one function that keeps content. It reduces turns to what
was said and done, for a person or a model to read: ids, timing, usage,
annotations, and metadata are removed, and strings longer than `maxChars` (800
by default) are cut short and end with `…`.

```typescript
import { simplify } from "@fifthrevision/axle/analyze";

const prompt = JSON.stringify(simplify(transcript.turns, { maxChars: 800 }));
```

Each simplified turn is `{ owner, status, error?, parts }`. A part is a `text`,
a `thinking`, a `file` (name only), a `tool` (`name`, `parameters`, and
`result` or `error`), a `subagent` (the same, plus its own `turns`), or a
`compaction`.

## What analyze can't see

`analyze()` sees what the turns record. A queued send cancelled before it
started and an error thrown before any turn opened leave no turn, so neither
appears.

## Next

- [Turns & Transcripts](/concepts/transcripts) — what you're analyzing
- [Transcript & turn events reference](/reference/transcript) — the shapes underneath
- [Annotations & evals](/cookbook/annotations) — scoring turns instead of counting them
