---
title: Turn events
description: The event stream an Agent emits — render-shaped, and best consumed by a Transcript.
---

# Turn events

`agent.on()` emits `AgentEvent` — the stream that builds the
[turns](/concepts/transcripts) you just met, plus the operation lifecycle
around them. The turn events are organized into turns and parts with
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

- **Operation lifecycle** — `operation:start`, `after:start`, `after:end`, `operation:end`, `agent:idle`
- **Pending lifecycle** — `pending:queued`, `pending:dropped`
- **Turn lifecycle** — `turn:user`, `turn:start`, `turn:end` (carries `failure?` and `reason?`)
- **Part streaming** — `part:start`, `text:delta`, `text:citation`,
  `thinking:raw-delta`, `thinking:summary-delta`, `thinking:update`, `part:end`
- **Actions** — `action:args-delta`, `action:running`, `action:waiting`, `action:input`,
  `action:progress`, `action:complete`, `action:cancelled`, `action:error`
- **Nesting** — `action:child-event`, wrapping a subagent's own turn events
- **Compaction** — `compaction:update`, `compaction:complete`, `compaction:cancelled`, `compaction:error`
- **Annotations** — `annotation:start`, `annotation:update`, `annotation:end`

### The operation around the turns

A send is an **operation** — a queued unit of work that produces turns. The
lifecycle events frame it: `operation:start { id, kind }` when it takes the
queue, `after:start` / `after:end` around its continuation if it carries one,
`operation:end { id, outcome }` when the handle settles, and `agent:idle` when
nothing is left queued behind it. The outcome is `complete`, `cancelled`, or
`error` with a message.

You rarely render these — they're for status bars, queue badges, and "agent is
working" indicators — but one companion is worth knowing: `agent.status` reads
`{ phase: "idle" }` or `{ phase: "busy", id }`, and already shows the new value
by the time the event that moved it reaches your callback. The callback type is
`AgentEventCallback`, taking the whole `AgentEvent`; every `AgentEvent` is still
a `TurnEvent`, so `agent.on(transcript.apply)` keeps working unchanged.

### The first event of a send is pending:queued

`send()` builds the user message and its turn up front, so the queued preview
and the committed turn share their id, parts, and timing. That means
`pending:queued` arrives inside the `send()` call, before `turn:user` — and a
send that never starts still emits `pending:queued` followed by
`pending:dropped` (cancelled while queued, or a setup failure). The turn's
timing is the moment of the call, not the moment the turn committed; for a send
that waited in the queue the two differ by the wait. A renderer that has no use
for previews can ignore both events — `Transcript` folds them, and they never
reach `turns`.

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
5. `action:complete`, `action:cancelled`, or `action:error`

Those phases describe one call. A step's calls [run at
once](/concepts/tools#one-batch-all-at-once), so in a batch every call reaches
phase 1 before any reaches phase 5, and phases 2 to 5 interleave across calls in
finish order. Key on the part's `id`, never on "the running tool".

A cancelled call ends `action:cancelled` with `status: "cancelled"` and no
`result` — a call that never got to run (turn cancelled while the model was
still streaming it, or before its batch started) settles the same way before
`turn:end`. Match `status === "cancelled"` instead of the old
`error.type === "aborted"` shape.

A deferred call skips the running phase entirely — nothing executes. The part
opens `pending`, moves to `waiting` when the validated call reaches your
handler (`action:waiting`, carrying the tool call `id` as `callId` plus `name`
and `input`), and closes with the answer. Its `kind` is `"deferred"`, with
`status` running `pending` → `waiting` → `complete` | `cancelled` | `error`.
See [Tools](/concepts/tools#deferred-tools).

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
