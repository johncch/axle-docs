---
title: Turns & Transcripts
description: The render-layer unit, and the container that accumulates it. Axle emits them; you keep them.
---

# Turns & Transcripts

A **turn** is one conversation entry as a reader sees it — a user turn or an
agent turn. It's the render-layer unit from
[Anatomy of a send](/concepts/anatomy-of-a-send#turn-the-render-lens), and it's
what your UI actually draws.

```typescript
interface Turn {
  id: string;
  owner: "user" | "agent";
  parts: TurnPart[]; // display order
  status: "streaming" | "complete" | "cancelled" | "error";
  annotations?: Annotation[];
  metadata?: Record<string, unknown>;
  timing?: { start: string; end?: string };
  usage?: Stats;
  error?: { type: string; message: string };
}
```

A **transcript** is the container that accumulates them. And here's the part that
catches people: **the agent doesn't keep one.** It emits `TurnEvent`s and holds
only the active [messages](/concepts/anatomy-of-a-send). If you don't fold those
events into a `Transcript` and store it, the reader-facing history is gone.

That sounds like a chore. It's three lines:

```typescript
import { Transcript } from "@fifthrevision/axle";

const transcript = new Transcript();
agent.on((event) => transcript.apply(event));

await agent.send("Hello").final;

transcript.turns; // readonly Turn[] — ready to render
```

That's the entire integration. The rest of this page is about why the boundary
sits there, and what you get once it does.

## Why the split

The model-facing conversation and the reader-facing history are genuinely
different things, and they drift apart:

- **Compaction** replaces `agent.messages` wholesale. For the model, the old
  messages stop existing. Your user should still see what happened.
- **Tool internals** — argument deltas, progress chunks, intermediate steps — are
  render detail that has no business in the wire format.
- **Annotations** — sandbox status, eval results, deploy state — are UI state
  that must never reach a provider.

Keeping the transcript outside the agent means compaction can be aggressive
without destroying your user's view, and your UI state can't leak into a prompt.
It's a small amount of work on your side in exchange for those two guarantees.

## What's in a turn

### It's shaped like your UI, on purpose

This is the thing worth noticing about turns: they aren't a lightly-renamed
provider stream. They're designed backwards from what a chat interface actually
needs to draw.

A turn maps to a message bubble. Parts map to components. Part ids are stable for
the life of the turn, so they're correct React keys. Statuses map to spinners and
error states. Even the awkward moments have a field — `pendingArgs` holds the
half-streamed JSON of a tool call's arguments, so there's something to render
before they parse.

The practical upshot is that rendering an agent is a `switch` over
`turn.parts`, and not much else:

```typescript
turn.parts.map((part) => {
  switch (part.type) {
    case "text": return <Markdown text={part.text} />;
    case "thinking": return <Collapsed text={part.text} />;
    case "action": return <ToolCall part={part} />;
    // …
  }
});
```

No reducer of your own, no buffering, no correlating ids across events —
`Transcript` did that on the way in. If you've built a chat UI on a raw provider
stream before, that's most of the work gone.

Parts are a discriminated union on `type`, so a `switch` covers them exhaustively:

| Part | What it carries |
| --- | --- |
| `text` | Accumulated text, plus any anchored `citations` |
| `thinking` | Reasoning text, optional `summary`, `redacted`, provider `continuity` |
| `file` | A `FileInfo` attached to a user turn |
| `citation` | An unanchored source list the provider emitted on its own |
| `action` | A tool call, subagent run, or provider tool — see below |
| `compaction` | A compaction event, rendered as a divider or summary |

Action parts discriminate further on `kind`:

- `kind: "tool"` — `detail.name`, `detail.parameters`, `detail.pendingArgs`, `detail.result`
- `kind: "agent"` — a subagent, with `detail.children: Turn[]` for the nested run
- `kind: "provider-tool"` — `detail.input`, `detail.result`

Which means rendering a subagent is recursive: the same component that renders
`transcript.turns` renders `part.detail.children`. That falls out nicely.

How these parts get built — the event families, and the openings-vs-deltas rule
`Transcript` is applying — is [Turn events](/concepts/turn-events).

## Annotations: the extension point

Parts are Axle's vocabulary — text, thinking, tool calls. **Annotations are
yours.** They're how you attach things Axle has no concept of to a turn or a
part, and have them render in the right place, without any of it becoming model
state.

```typescript
interface Annotation<TData = unknown, TKind extends string = string> {
  id: string;
  kind: TKind; // your discriminator
  label: string; // what a generic renderer shows
  placement?: "before" | "after";
  status?: "running" | "complete" | "cancelled" | "error";
  data?: TData; // your payload
  timing?: { start: string; end?: string };
}
```

Think of it as a plugin slot in the transcript. Eval scores, a sandbox booting,
a deploy status, a cost warning, a moderation flag, "3 files changed" — none of
these are things a model said, and none belong in a prompt. But all of them want
to appear next to the turn they relate to, in order, with a lifecycle.

Three properties make this work as an extension mechanism:

**They're typed as a union you define.** `Transcript<MyAnnotation, MyEvent>`
flows your type through `turn.annotations` and `part.annotations`, so a
`switch (annotation.kind)` in your renderer is exhaustive and checked.

**They have a lifecycle.** `annotation:start` → `annotation:update` →
`annotation:end`, with `status` moving `running` → `complete` / `error`. So
async work — an eval that takes six seconds — can show a spinner and then a
result, using the same machinery a tool call uses.

**`label` is required for a reason.** It means a generic renderer can display
*any* annotation kind, including ones added after that renderer was written. You
get a working fallback for free, and specialize only the kinds worth
specializing.

**They never reach a provider.** Annotations live on the transcript, which the
agent doesn't own or send. You can attach anything, including things you'd never
want a model to read.

The worked example — an eval pipeline that scores each turn and renders inline —
is in [Annotations & evals](/cookbook/annotations).

## Saving and restoring

`Transcript` is a plain in-memory fold. Save `turns`, restore by handing them
back:

```typescript
await db.save(sessionId, {
  session: await agent.snapshot(), // { sessionId, messages }
  turns: transcript.turns,
});

// later
const saved = await db.load(sessionId);
const agent = new Agent(config, saved.session);
const transcript = new Transcript(saved.turns);
agent.on((event) => transcript.apply(event));
```

Two things to persist, not one. `AgentSession` leaves turns out on purpose. See
[Sessions & persistence](/concepts/sessions).

The constructor shallow-copies the array you give it, and `turns` is readonly —
so later changes to your array won't reach inside the transcript. Structural
changes only happen through `apply()`.

## Mixing in your own events

If your application has its own event stream, `apply()` passes through anything
it doesn't recognize:

```typescript
import { Transcript } from "@fifthrevision/axle";
import type { Annotation, TurnEvent } from "@fifthrevision/axle";

type SandboxAnnotation = Annotation<{ image: string }, "sandbox">;
type HostEvent = { type: "run:terminal"; status: string };

const transcript = new Transcript<SandboxAnnotation, HostEvent>();

// Type your event source as the union the transcript accepts.
declare const incoming: Array<TurnEvent<SandboxAnnotation> | HostEvent>;

for (const event of incoming) {
  const result = transcript.apply(event);
  if (!result.handled) {
    // result.event is typed as HostEvent here
    myReducer(result.event);
  }
}
```

Note the annotation type flows into `TurnEvent` too. Once you parameterize
`Transcript` with your own annotation union, a bare `TurnEvent` from
`agent.on()` won't be assignable — type the transport as
`TurnEvent<YourAnnotation> | YourHostEvent` at the boundary.

Both `Transcript` and `apply()` are generic over your annotation union and your
host event type, so one dispatcher stays fully typed end to end — including the
`handled: false` branch.

## Keeping provider SDKs out of your bundle

Your UI code probably shouldn't transitively import the Anthropic, OpenAI, and
Google SDKs. The `/ui` subpath is the type-only surface for renderers:

```typescript
import type { Turn, TurnEvent, TurnPart } from "@fifthrevision/axle/ui";
import { Transcript } from "@fifthrevision/axle/ui";
```

## What about `result.turn`?

Each send resolves with a `turn` — the agent turn for that send, already
accumulated. It's a convenience for callers who don't maintain a transcript. The
agent's internal accumulator resets after every send, so it isn't a history and
shouldn't be treated as one.

## Next

- [Sessions & persistence](/concepts/sessions)
- [Transcript & turn events reference](/reference/transcript)
- [Streaming to a UI](/cookbook/streaming-ui)
