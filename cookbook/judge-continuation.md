---
title: Judging a turn with a continuation
description: A critic that runs before the next send lands — a typed judge, a bounded retry, and what the result carries.
---

# Judging a turn with a continuation

Two things have to be true for a critic to be worth having. It has to see the
answer before the user's next message does, and it has to be able to make the
agent try again. A [continuation](/concepts/continuations) is both: it runs when
the turn settles, holds the queue while it works, and `ctx.send()` puts the
revision in the same conversation rather than a side channel.

```typescript
const handle = agent.send("Summarize the incident report for the status page.", {
  after: async (result, ctx) => {
    let answer = result;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!answer.ok) return;
      const verdict = await judge(answer.response, ctx.signal);
      if (verdict.pass) return;
      answer = await ctx.send(`${verdict.feedback}\n\nRewrite the summary.`);
    }
  },
});

const result = await handle.final;
const final = result.after?.at(-1)?.response ?? result.response;
```

Three decisions are already baked into those twelve lines, and they're the ones
that matter: the loop is **bounded**, a failed turn is **not** judged, and the
caller reads the *last* answer rather than the first. The rest of this page is
each of those, plus the judge itself.

## A judge that returns a verdict, not prose

[`decide()`](/concepts/decisions) is built for this: one request, one typed
answer per question, no conversation and nothing to parse.

```typescript
import { decide, noul, score, type DecisionProvider } from "@fifthrevision/axle";

declare const decisionProvider: DecisionProvider;

async function judge(answer: string, signal: AbortSignal) {
  const { answers, usage } = await decide({
    provider: decisionProvider,
    model: "jev-latest",
    input: answer,
    questions: {
      grounded: noul("Is every claim supported by the incident report?", {
        true: "Every claim traces to the report",
        false: "At least one claim is invented or unsupported",
      }),
      clarity: score("How clear would this be to someone paging in at 3am?", [
        "Unreadable",
        "Understandable after a re-read",
        "Clear on first read",
      ]),
    },
    signal,
  });

  const grounded = answers.grounded.type === "refusal" ? 0 : answers.grounded.noul;
  const clarity = answers.clarity.type === "refusal" ? 0 : answers.clarity.score;

  return {
    pass: grounded > 0.8 && clarity >= 2,
    feedback: `Grounding ${grounded.toFixed(2)}, clarity ${clarity}. Fix the unsupported claims and tighten the opening.`,
    usage,
  };
}
```

`noul` gives you a probability rather than a yes, which is what you want for a
threshold you'll tune. `score` gives you an ordinal with the legend you wrote.
Both can come back as a `refusal` for that one question while the rest of the
decision stands — treat a refusal as "no evidence", as above, rather than
letting `undefined` decide for you.

### Or judge with the model you already have

No decision model? Use `generate()` with an `Instruct` and a schema. You own the
parsing contract, and you get prose rationale the retry can quote:

```typescript
import { generate, Instruct } from "@fifthrevision/axle";

const critique = new Instruct({
  prompt: "Judge whether the summary below is fully supported by the report.\n\n{{answer}}",
  schema: z.object({
    pass: z.boolean(),
    feedback: z.string().describe("What to fix, addressed to the writer"),
  }),
});

declare const answer: string;

const verdict = await generate({
  provider,
  model,
  instruct: critique.withInputs({ answer }),
});
if (verdict.ok) console.log(verdict.response.pass, verdict.response.feedback);
```

A `generate()` call is a plain request with no conversation, so the judge can't
see — or pollute — the agent's messages. That's the property you're paying for
either way; a critic that reads the transcript it's judging tends to agree with
it.

## What the result carries

The handle resolves when the continuation returns, and the shape is the
original send's result with the inline turns appended:

```typescript
result.response; // the FIRST answer — the one the judge rejected
result.after; // InlineTurn[] — each { userTurn, ok, response, turn, usage }
result.after?.at(-1)?.response; // the answer you want to show
```

This trips people once. The top-level fields never move: they are the reply to
the message you sent. The revisions live under `after`, in order, so "the final
answer" is the last entry — and when the judge passed on the first try there are
no entries at all, which is why the recipe above falls back to
`result.response`.

## Accounting

A judge costs tokens and they do not appear by themselves.

```typescript
import { mergeStats, computeCost } from "@fifthrevision/axle";

declare const judgeUsage: Stats; // the `usage` decide() returned

const turnUsage = mergeStats(result.usage, ...(result.after ?? []).map((t) => t.usage));
const total = mergeStats(turnUsage, judgeUsage);
const cost = computeCost(total, catalog);
```

Inline turns are the agent's own work, so each carries its usage and none of it
is rolled into the top-level `usage` — merge them yourself. A `decide()` or
`generate()` judge is a separate call on a separate provider, so its `usage` is
its own, with its own rows in `breakdown`. Merged, every row keeps its provider
and model, and [`computeCost`](/concepts/model-catalog#what-a-run-cost) prices
each at its own tier — which is how you find out that three retries of a cheap
critic cost less than the one revision it bought.

## When things go wrong

- **A failed turn.** The continuation runs whether the send resolved `ok` or
  not, so decide what a failure means before you judge it. Judging an
  `AxleProviderFailure` is judging the absence of an answer; returning early, as
  above, leaves the error on the result for the caller.
- **A judge that throws.** A continuation that throws rejects the handle, and
  the user's answer goes with it. Wrap the judge so a flaky critic degrades to
  "accept the answer" rather than losing it:

  ```typescript
  const verdict = await judge(answer.response, ctx.signal).catch(() => ({ pass: true, feedback: "" }));
  ```

- **Cancellation.** Pass `ctx.signal` into the judge, as above. `cancel()`
  during a continuation aborts that signal and any inline turn in flight, then
  rejects the handle — so a cancelled judge should stop, not fall through to a
  retry.
- **A loop with no bound.** The queue is held while the continuation runs: every
  send behind it waits, including the one the user just typed. Two attempts and
  a cap on the judge's own latency keeps that honest.

## Showing it in the UI

Inline turns are ordinary turns — they emit the usual events and fold into your
`Transcript`, drawn as replies via each one's `threadId`. The verdict itself
isn't a turn and doesn't belong in the conversation; it's render state, which is
what annotations are for. [Annotations & evals](/cookbook/annotations) has the
plumbing, including the version that runs an eval *after* the send settles and
out of band — reach for that one when the judgement doesn't need to gate
anything.

## See also

- [Continuations](/concepts/continuations) — the mechanism, the queue, and the boundaries
- [Typed decisions](/concepts/decisions) — `noul`, `choice`, `score`
- [Annotations & evals](/cookbook/annotations) — surfacing a verdict to a reader
- [Model catalog & cost](/concepts/model-catalog) — pricing the retries
