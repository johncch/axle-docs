---
title: Stream events
description: The event stream the primitives emit — execution-shaped, and yours to handle.
---

# Stream events

`stream()` emits `StreamEvent`. It's the execution-layer stream: steps, raw
provider output, and tool lifecycle, in the order they happen.

There's no conversation down here, so there are no turns and nothing for a
[`Transcript`](/concepts/transcripts) to fold. These events are execution-shaped
rather than UI-shaped, and handling them yourself is the expected thing to do —
the opposite of the advice for [turn events](/concepts/turn-events).

```typescript
import { stream } from "@fifthrevision/axle";

const handle = stream({
  provider,
  model,
  messages: [{ role: "user", content: "Hello" }],
  tools: [myTool],
});

handle.on((event) => {
  switch (event.type) {
    case "step:start":
      console.log("request", event.id, event.model);
      break;
    case "text:delta":
      process.stdout.write(event.delta);
      break;
    case "tool:exec-complete":
      console.log("tool done", event.name);
      break;
  }
});

const result = await handle.final;
```

You don't have to race to register callbacks — processing starts on the next
microtask, so anything you register synchronously after `stream()` returns will
see every event.

## What's different from turn events

If you've come from `agent.on()`, four things change:

- **Deltas carry `accumulated` as well as `delta`**, so you never have to
  concatenate yourself. Turn events assume a `Transcript` is holding the part.
- **Tool events correlate by `id`**, not by part id.
- **Text and thinking stream sequentially**, and a delta belongs to the most
  recently opened part of its kind.
- **`step:start` / `step:complete` are visible.** Turn events deliberately hide
  the loop boundaries by flattening every step into one turn; here they're the
  primary structure.

## The event families

- **Step and batch boundaries** — `step:start`, `step:complete`,
  `tool-results:start`, `tool-results:complete`
- **Text** — `text:start`, `text:delta`, `text:citation`, `text:end`, plus
  `citation` for an unanchored source list
- **Thinking** — `thinking:start`, `thinking:delta`,
  `thinking:summary-delta`, `thinking:update`, `thinking:end`
- **Tools** — `tool:request`, `tool:args-delta`, `tool:exec-start`,
  `tool:exec-delta`, `tool:exec-complete`, `tool:exec-error`
- **Provider tools** — `provider-tool:start`, `provider-tool:complete`
- **Error** — `error`

Every field is listed in the
[generate() & stream() reference](/reference/generate-stream#streamevent).

## Steering the loop

`onToolBatchComplete` runs after each tool batch settles and decides whether to
keep going:

```typescript
handle.onToolBatchComplete((message) => {
  return shouldStop ? "finish" : "continue";
});
```

`"finish"` ends the run without another provider request — every tool in that
batch has already completed and committed, so nothing is lost. This is the
primitive [`agent.stop()`](/concepts/agent#the-steer-playbook) is built on, if
you want that behaviour in your own loop.

## What about generate()?

`generate()` runs the same loop without streaming and resolves the final result
directly — no events at all. It's the right choice for batch work where nobody's
watching.

## If you want render state anyway

`TurnEventBuilder` performs the same `StreamEvent` → `TurnEvent` translation
`Agent` does internally, so you *can* build a transcript from a raw `stream()`.

But if that's what you want, you probably want `Agent` — it's `stream()` plus
exactly that translation, history management, and a send queue. Reach for the
builder only when you need the loop control the primitives give you *and* a
rendered conversation.

## Next

- [generate() & stream()](/concepts/generate-and-stream) — the functions themselves
- [Turn events](/concepts/turn-events) — the Agent-layer equivalent
- [generate() & stream() reference](/reference/generate-stream) — every event field
