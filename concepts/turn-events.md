---
title: Turn events
description: The event stream an Agent emits — render-shaped, and best consumed by a Transcript.
---

# Turn events

`agent.on()` emits `TurnEvent` — the stream that builds the
[turns](/concepts/transcripts) you just met. Organized into turns and parts with
stable ids, shaped for drawing a conversation rather than for driving a loop.

A turn is an Agent concept, so this is the *only* place turn events come from.
Down at [`generate()` and `stream()`](/concepts/generate-and-stream) there's no
conversation, so there are no turns — those emit
[`StreamEvent`](/concepts/stream-events) instead.

You've already seen what to *do* with these: hand them to a
[`Transcript`](/concepts/transcripts) and render its turns. That stays the
advice. This page is about what's actually flowing through that pipe — useful
for understanding what you're rendering, and for the times you want to tap the
stream directly.

## When to handle events yourself

Three situations, and they have something in common: you aren't rendering a
conversation.

- **Terminal output or logging.** You want `text:delta` written to stdout, not a
  turn structure.
- **Forwarding over a wire.** Serialize the event, ship it, and call `apply()` on
  the *other* side. Don't reduce twice.
- **Reacting to a specific moment** — telemetry on `action:complete`, a
  notification on `turn:end`. Subscribe alongside a transcript rather than
  instead of one; `agent.on()` takes as many callbacks as you like.

If you find yourself accumulating text into a variable, tracking which part is
open, or keying a map by `partId` — stop. That's `Transcript`'s job, and it
already handles the edge cases you haven't hit yet.

## The event families

Every event after `turn:user` carries a `turnId`, and part-level events carry a
`partId` — the same stable ids you render against.

- **Turn lifecycle** — `turn:user`, `turn:start`, `turn:end`
- **Part streaming** — `part:start`, `text:delta`, `text:citation`,
  `thinking:delta`, `thinking:summary-delta`, `thinking:update`, `part:end`
- **Actions** — `action:args-delta`, `action:running`, `action:progress`,
  `action:complete`, `action:error`
- **Nesting** — `action:child-event`, wrapping a subagent's own turn events
- **Compaction** — `compaction:update`, `compaction:complete`, `compaction:error`
- **Annotations** — `annotation:start`, `annotation:update`, `annotation:end`
- **Error** — `error`

### Openings carry everything, deltas carry almost nothing

The one structural rule worth internalizing: `part:start` hands you the complete
part object, while every delta after it carries only `partId` and the change.

So somebody has to hold that part and patch it as deltas arrive. That somebody
should be `Transcript` — this asymmetry is precisely the work it exists to do,
and it's why hand-rolling a reducer gets fiddly faster than you'd expect.

Full listing in the [Transcript & turn events reference](/reference/transcript).

### A tool call, in phases

A tool call shows up as an `action` part moving through states:

1. `part:start` with `status: "pending"` — the model has begun requesting it
2. `action:args-delta` — argument JSON streaming in, not yet parseable
3. `action:running` with parsed `parameters` — execution has begun
4. `action:progress` — whatever the tool passed to `ctx.emit`
5. `action:complete` or `action:error`

`Transcript` folds all five into one `action` part whose `status` and `detail`
you can render directly. The `pendingArgs` field it maintains during phase 2
exists so you have *something* to show while the arguments are still an
incomplete JSON string — a small thing that makes streaming UIs feel much
better.

### Annotation events

`annotation:start` / `:update` / `:end` carry a `target` —
`{ type: "turn", turnId }` or `{ type: "part", turnId, partId }` — and
`Transcript` files them against it. What annotations are *for* is covered under
[Annotations](/concepts/transcripts#annotations-the-extension-point); the recipe
is [Annotations & evals](/cookbook/annotations).

## Next

- [Turns & Transcripts](/concepts/transcripts) — folding these into render state
- [Streaming to a UI](/cookbook/streaming-ui) — a complete recipe
- [Stream events](/concepts/stream-events) — the primitive layer's equivalent
