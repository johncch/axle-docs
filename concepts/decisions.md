---
title: Typed decisions
description: One request, one typed answer per question — decide() and the typesafe() provider.
---

# Typed decisions

Some calls aren't conversation. You have a support ticket and want to know "is
this a bug, and who owns it?" — not a sentence, but two typed values. That's a
decision: one input, a set of typed questions about it, one answer per
question, no messages, no turns, no tool loop.

::: warning Experimental
Decisions are marked `@experimental`: the question, answer, and provider shapes
may change in a minor release.
:::

```typescript
import { decide, typesafe, noul, choice } from "@fifthrevision/axle";

const decisionProvider = typesafe(process.env.TYPESAFE_API_KEY!);

const result = await decide({
  provider: decisionProvider,
  model: "jev-latest",
  input: "Refund request #4821: customer was charged twice after a failed checkout.",
  questions: {
    isBug: noul("Is this a bug in our checkout?"),
    owner: choice("Which team owns this?", {
      payments: "Money movement and charging",
      frontend: "UI and checkout flow",
    }),
  },
});

if (result.answers.isBug.type === "noul" && result.answers.isBug.noul > 0.8) {
  const owner = result.answers.owner;
  console.log(`likely a bug — queue for ${owner.type === "choice" ? owner.choice : "triage"}`);
}
```

Questions are built with three helpers. `noul` is yes/no — its answer `noul`
is the probability of yes, 0 to 1, where near 0.5 means unsure rather than
"partly". `choice` picks one option you define — its answer carries the chosen
option, a probability per option, and a confidence. `score` places the input
on an ordered scale you define, lowest level first — its answer `score` is a
probability-weighted, zero-based position that can fall between levels.
`criteria` is your description of the possible answers in each case.

## Answers come back under your keys

Questions are a map keyed by names you choose, and answers arrive under the
same keys — typed from the questions when you write them literally, so a
`choice` over `payments` and `frontend` yields a `choice` answer whose `choice`
is `"payments" | "frontend"`. Every answer is its own type or a refusal: narrow
on `type` before reading a value.

```typescript
const answer = result.answers.owner;
if (answer.type === "refusal") {
  // the provider declined this question; the rest of the decision stands
} else {
  console.log(answer.choice, answer.confidence);
}
```

A refusal belongs to one question and is unrelated to the chat-side `Refusal`,
which describes a declined request or blocked output.

## decide() throws; it does not return ok

There is no partial state to hand back, so there is no `ok` flag. A rejected
request, a transport failure, a timeout, or an abort rejects the promise — and
a result that contradicts its questions (a missing or mistyped answer) throws
`DECISION_ANSWER_MISMATCH`. `result.usage` carries the provider's input and
output token counts. Pass `signal` to abort, `span` to trace (it opens a child
span named `decide`).

`typesafe()` reaches TypeSafe's System One API and nothing else: it answers
`decide()` questions and cannot generate text, so the type system rejects it
as the `provider` of `stream()`, `generate()`, or an `Agent`. Point `baseUrl`
at a compatible host (an OpenRouter key with `https://openrouter.ai/api`) to
route through it.

## Next

- [Decisions reference](/reference/decisions) — every signature
- [Providers & models](/concepts/providers) — the chat-side counterpart
- [generate() & stream()](/concepts/generate-and-stream) — the other primitive
