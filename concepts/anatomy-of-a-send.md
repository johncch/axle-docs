---
title: Anatomy of a send
description: Messages, steps, and turns — the three words the rest of the docs lean on.
---

# Anatomy of a send

Axle looks at a conversation through three different lenses, and it has a
different word for the unit at each one. Almost every confusing moment with this
library comes from mixing them up, so let's sort them out first. It won't take
long.

| Lens | Unit | Made of | Where you find it |
| --- | --- | --- | --- |
| Wire | **Message** | content parts | `agent.messages` |
| Execution | **Step** | one request + its fallout | inside `send()` |
| Render | **Turn** | parts (+ annotations) | your `Transcript` |

One `send()` is **one or more steps**, and it produces **one user turn and one
agent turn**, carried over the wire as **messages**.

If you only remember one thing: *step* is about what the code does, *turn* is
about what the reader sees.

## Let's walk through one

```typescript
const result = await agent.send("What's the weather in Lisbon?").final;
```

With a `get_weather` tool registered, here's what that one line actually does.

1. **Your message commits.** Axle renders the `Instruct` into an
   `AxleUserMessage`, appends it to `agent.messages`, and emits `turn:user`.
   Before this moment, cancelling commits nothing at all.
2. **The agent turn opens.** `turn:start` fires with a fresh `turnId`. Everything
   the model does for the rest of this send piles into that one turn.
3. **Step 1 runs.** One streaming request to the provider. The model comes back
   asking for `get_weather`. That assistant message joins `agent.messages`.
4. **The tools run.** Everything the model asked for executes — in parallel, if
   it asked for several. The results become one tool message, also appended.
5. **Step 2 runs.** A second request, now carrying the tool results. This time
   the model answers with text and no tool calls, so the loop ends.
6. **The turn closes.** `turn:end` fires. `result.response` is the text from step
   2, `result.usage` covers both steps, and `result.turn` is the whole
   accumulated agent turn.

Two steps. Four messages. Two turns. One `send()` — and from your side, one
`await`.

## Message — the wire lens

An `AxleMessage` is a role-tagged record (`user`, `assistant`, or `tool`) whose
`content` is a list of parts. Messages are what providers actually consume, and
what [compaction](/concepts/compaction) rewrites.

```typescript
agent.messages; // AxleMessage[] — a copy of the active conversation
```

One thing worth knowing early: this is the *active* conversation, not a complete
log. Compaction can replace the whole array, and when it does, the old messages
are genuinely gone. If you need to show a user what happened earlier, that's the
transcript's job, not this array's.

"Message" never means render state, and never means the text a user typed into
your chat box.

More detail: [Messages & parts](/reference/messages).

## Step — the execution lens

A **step** is one pass of the loop inside a `send()`: one provider request, the
assistant message it produced, and the tools that message asked for, if any.

A send ends at the first step where the model doesn't ask for tools. It can also
end early if a budget stops it (`maxSteps`, `maxContextTokens`) or if you call
`agent.stop()`.

Steps don't show up in conversation state — each one's output gets flattened into
messages and into the agent turn's parts. You'll see them in two places:

- [Stream events](/concepts/stream-events) `step:start` / `step:complete`
- Spans named `step-N` in [tracing](/concepts/observability)

The name matches how the rest of the ecosystem uses it — the Vercel AI SDK's
`maxSteps`, OpenAI's run steps.

::: warning This was renamed in 0.29.0
Steps used to be called "turns", and the option used to be `maxIterations`. It's
`maxSteps` now, and the stop reason is `"max-steps"`. See [Upgrading](/upgrading)
if you're coming from an older version.
:::

## Turn — the render lens

A **turn** is one conversation entry as a reader sees it — a user turn or an
agent turn. Each send produces exactly one of each. The agent turn collects parts
(text, thinking, tool actions, files, citations) from every step of that send.

```typescript
result.turn.parts; // TurnPart[], in display order
result.turn.status; // "complete" | "cancelled" | "error"
```

Compaction can open turns too: a manual `agent.compact()` opens and closes its
own agent turn around the compaction part.

"Turn" never means a single assistant message, and never means one provider
request. That's a step.

More detail: [Turns & Transcripts](/concepts/transcripts).

## Two more words

**Send** — the Agent verb. One scheduled exchange, run as a FIFO queue item. It's
the unit that means "the agent took its turn."

**Session** — the continuable identity of a conversation. `AgentSession` is its
serialized form: `{ sessionId, messages }`, and nothing more. The transcript
isn't part of it — you persist that alongside. See
[Sessions & persistence](/concepts/sessions).

## Who owns what

This is the part that surprises people most, so it's worth stating plainly:

- **Axle owns** the active conversation (`agent.messages`) and the event stream.
- **You own** the transcript. The agent doesn't keep one. It emits `TurnEvent`s
  and forgets them. If you don't fold those events into a `Transcript` and store
  it, the reader-facing history is gone.

`agent.snapshot()` gives you the continuation — session id and messages — and
deliberately leaves turns out. It's not an oversight; it's the boundary. The
[Transcripts](/concepts/transcripts) page explains why it's drawn there, and it's
three lines of code to hold up your end.

## Next

- [Providers & models](/concepts/providers) — where requests actually go
- [Agent](/concepts/agent) — scheduling, interruption, cancellation
- [Glossary](/glossary) — all of this, in short form, for when you forget
