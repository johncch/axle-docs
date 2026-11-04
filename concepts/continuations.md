---
title: Continuations
description: Running follow-up turns after a send settles, without leaving the queue.
---

# Continuations

A continuation is a program a send carries under `after`. It runs once that
send's turn settles, holds the queue until it returns, and runs further turns
inline through `ctx.send()`.

```typescript
declare const judge: (result: unknown) => Promise<{ ok: boolean; feedback: string }>;

const handle = agent.send("Summarize the report.", {
  after: async (result, ctx) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const verdict = await judge(result);
      if (verdict.ok) break;
      result = await ctx.send(verdict.feedback);
    }
  },
});
agent.send("Next question."); // waits until the continuation returns
```

Reach for one when the next step depends on judging the last answer —
verify-then-retry loops, critic loops, "keep going until the checker passes".
If the follow-up doesn't depend on the result, a second `send()` is simpler.

## How it runs

The continuation runs after the send's turn settles with a result, `ok` or
not. A turn whose handle rejects (cancelled, a fatal tool error, a setup
failure) skips it.

While it runs, the queue is held: sends queued behind this one wait until the
continuation returns. `ctx.send()` runs an **inline turn** — the same
arguments as `send()` without `after`, an ordinary turn in every way except it
starts at once with no `pending:queued`, runs one at a time in call order, and
returns a promise (not a handle). `ctx` also carries `signal`, `id` (the
send's user turn id), and read-only `messages` and `pending`.

```typescript
after: async (result, ctx) => {
  if (!result.ok) return; // decide what a failure means here
  const second = await ctx.send("Now compress that to one sentence.");
  console.log(second.response);
},
```

The handle resolves when the continuation returns, with the inline turns
listed in order under `result.after` — each an `InlineTurn` (`userTurn` plus
that turn's `ok`, `response`, `turn`, `usage`). The top-level fields stay the
message you sent and its reply; a caller that wants the corrected answer reads
the last entry. A plain send's result has no `after`.

Three boundaries to know:

- A manual `compact()` carries no continuation, and an inline turn carries
  none — no nesting.
- A continuation that throws rejects the handle, and the queue continues.
- `cancel()` during a continuation aborts `ctx.signal` and any inline turn in
  flight and rejects the handle; before it starts, it never starts. `stop()`
  keeps its tool-batch meaning for an inline turn in flight. `clear()` never
  touches a continuation.

## Observing it

Inline turns are ordinary turns: they emit the usual `turn:*` and part events,
commit to `agent.messages`, and fold into your `Transcript` the same way. Two
differences for hosts that track the queue:

- No `pending:queued` announces an inline turn — it starts at once. A host
  that keys queued rows by id ignores inline turns by construction.
- `onSettled` fires for each inline turn under that turn's own id, after that
  turn's `turn:end`. Slow per-cycle work in the callback (a sandbox snapshot,
  say) runs after every inline turn — move it to the end of the continuation.

## Next

- [Agent](/concepts/agent#after-continuations-run-after-the-turn-settles) — sends, the queue, and interruption
- [Agent reference](/reference/agent#after-continuations) — `Continuation`, `ContinuationContext`, `InlineTurn`
- [Sessions & persistence](/concepts/sessions) — saving after each turn with `onSettled`
