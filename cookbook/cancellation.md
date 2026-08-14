---
title: Interrupting & cancelling
description: stop, clear, cancel, and the interjection pattern.
---

# Interrupting & cancelling

There are four mechanisms here, and they're genuinely not interchangeable. This
table is the short version — the rest of the page is the detail.

| Call | Effect on the active turn | Effect on the queue | Work already done |
| --- | --- | --- | --- |
| `agent.stop()` | Ends at the next tool-batch boundary | Untouched | Kept and committed |
| `agent.clear()` | Untouched | Cancelled | N/A |
| `handle.cancel()` | Aborted immediately | Untouched | Partially preserved |
| `signal` on send | Same as `cancel()` | | |

## stop(): let the work finish

```typescript
const running = agent.send("Refactor the auth module.");

// later, from a UI event
const wasRunning = agent.stop(); // false if nothing was executing
```

The tool batch that's in flight — including parallel calls — runs to completion
and commits. Then the handle settles without another provider request. Nothing
gets wasted, and the history stays coherent.

What comes back may surprise you the first time. A stopped turn ends on its
tool-call exchange, so a plain send resolves with whatever text that step
produced — often an empty string. An `Instruct` send may come back `ok: false`
with a parse error, simply because no final answer exists yet. That's by design,
not a bug.

`stop()` won't interrupt a provider request or a tool that's already running. If
you need a hard stop, that's `cancel()`.

## The steer playbook

Three calls, in this order. This is the pattern you'll use most:

```typescript
agent.stop(); // active turn wraps up cleanly
agent.clear(); // drop anything queued behind it
agent.send("Actually, make the button blue."); // becomes the very next turn
```

**Stop, clear, send.** It gracefully halts what the agent is doing and inserts
the user's new instruction as the next turn — which is exactly what a user
expects when they interrupt.

Wiring it to a chat box is about as simple as it looks:

```typescript
function onUserSubmit(text: string) {
  agent.stop();
  agent.clear();
  return agent.send(text);
}
```

That's safe to call whether or not the agent is busy. `stop()` returns `false`
and `clear()` returns `0` when there's nothing to interrupt, so the same handler
covers the idle case.

The new turn runs against a linear committed history that includes the tools
that already finished — so the agent knows what it did before you redirected it,
and won't repeat that work.

::: warning Order matters
Call `clear()` before `stop()` and you leave a window where the active turn can
finish and pull in the queued work you were about to drop.
:::

## cancel(): stop now

```typescript
const handle = agent.send("Write a very long essay.");
setTimeout(() => handle.cancel({ reason: "timeout", afterMs: 5000 }), 5000);

try {
  const result = await handle.final;
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    console.log("cancelled");
  } else {
    throw error;
  }
}
```

This is local to that one handle — other sends carry on unaffected.

### What survives

```typescript
import { AxleAgentAbortError } from "@fifthrevision/axle";

catch (error) {
  if (error instanceof AxleAgentAbortError) {
    error.reason; // what you passed to cancel()
    error.usage; // tokens already spent — still billable
    error.partial; // the partially-streamed assistant message
    error.messages; // messages completed before the abort
    error.turn; // the cancelled turn, for rendering
  }
}
```

Showing partial output after a cancel is usually the right call. Your user paid
for those tokens, and half an essay beats a blank screen.

```typescript
const text = error.partial?.content.find((p) => p.type === "text");
if (text?.type === "text") render(text.text);
```

### What commits

Whether the user message sticks around depends on timing, and the line is the
`turn:user` event:

- **Before** it — queued, or during MCP setup — the handle is dropped and nothing
  commits.
- **After** it, the user message stays committed and the turn is marked
  `cancelled`. This includes cancelling during `beforeTurn` compaction:
  compaction is work inside an already-open turn, and cancelling does not unwind
  the transcript.

## AbortSignal

If you already have abort plumbing, it slots straight in:

```typescript
const controller = new AbortController();
const result = await agent.send("...", { signal: controller.signal }).final;
```

A signal that's already aborted fails the send before anything commits.

## clear(): drain the queue

```typescript
const dropped = agent.clear();
console.log(`cancelled ${dropped} queued sends`);
```

Each cleared handle rejects with `AxleAgentAbortError`, having committed
nothing. The active turn is left alone.

## Cancelling a stream()

Same shape, one class up the hierarchy:

```typescript
import { stream, AxleAbortError } from "@fifthrevision/axle";

const handle = stream({ provider, model, messages });
setTimeout(() => handle.cancel("timeout"), 4000);

try {
  await handle.final;
} catch (error) {
  if (error instanceof AxleAbortError) {
    console.log(error.reason, error.usage, error.partial);
  }
}
```

`AxleAgentAbortError` extends `AxleAbortError`, so an `instanceof AxleAbortError`
check catches both.

## Cancellation inside tools

Your tools have to cooperate here. Without forwarding the signal, cancelling
stops the agent while your work keeps running in the background:

```typescript
async execute({ url }, ctx) {
  const res = await fetch(url, { signal: ctx.signal }); // forward it
  return await res.text();
}
```

For a long CPU-bound loop, poll it:

```typescript
for (const item of items) {
  if (ctx.signal.aborted) throw new Error("Aborted");
  await handleItem(item);
}
```

## Timeouts

```typescript
const result = await agent.send("...", { signal: AbortSignal.timeout(30_000) }).final;
```

That's a wall-clock cap on the whole send, tool loop included. If you'd rather
cap the number of model requests, use `maxSteps` with
[`stream()`](/concepts/generate-and-stream) — which is a stop rather than an
error, so you keep everything produced so far.

## See also

- [Agent](/concepts/agent#interrupting-three-different-things)
- [Results & errors](/concepts/results-and-errors#cancellation)
- [Errors reference](/reference/errors)
