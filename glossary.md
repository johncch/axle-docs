---
title: Glossary
description: The normative vocabulary. Code, docs, and events use these words with exactly these meanings.
---

# Glossary

Names in Axle are load-bearing — they show up in event types, span names, option
names, and your own code. So these definitions are normative: if a page on this
site contradicts one, the page is wrong and we'd like to know.

If you're meeting these for the first time,
[Anatomy of a send](/concepts/anatomy-of-a-send) walks through them properly.
This page is the quick-reference version.

## The three strata

| Layer | Unit | Contains | Lives at |
| --- | --- | --- | --- |
| Wire | Message | content parts | `agent.messages` |
| Execution | Step | one request + its fallout | the `send()` loop |
| Render | Turn | parts (+ annotations) | the host's `Transcript` |

One `send()` = one or more **steps**, producing one user **turn** and one agent
**turn**, carried on the wire as **messages**.

## Terms

**Message** — the wire-layer unit: a role-tagged (`user` / `assistant` / `tool`)
`AxleMessage` whose `content` is a list of parts. Messages are what providers
consume and what compaction rewrites. Never render state; never host-level chat
input.

**Part** — the atomic content unit: text, thinking, tool-call, file, citation.
Parts are the shared vocabulary of the wire layer (`AxleMessage.content`) and the
render layer (`Turn.parts`) — the same concept at both. A subagent invocation is
a tool-call part like any other.

**Step** — one pass of the execution loop inside a `send()`: one provider
request, the assistant message it yields, and the tool batch that message
requests, if any. A send ends with the first step whose message requests no
tools, or when a budget (`maxSteps`, `maxContextTokens`) or a boundary control
stops the loop. Steps are invisible in conversation state — each step's output is
flattened into messages and into the agent turn's parts. Spans are named
`step-N`; stream events are `step:start` / `step:complete`.

**Turn** — the render-layer unit only: one conversation entry in a transcript, a
user turn or an agent turn. One send produces one of each; the agent turn
accumulates parts from every step. Turns can also be opened and closed by
compaction. Never a single assistant message; never a provider request.

**Send** — the Agent API verb: one scheduled conversation exchange
(`agent.send(...)`), executed as a FIFO queue item. The host-facing unit of "the
agent took its turn."

**Transcript** — the host-owned, reader-facing fold of `TurnEvent`s into turns
and annotations. The exported `Transcript` class is the shipped in-memory
implementation; hosts persist its `turns` and pass them to the constructor on
restore. The Agent holds no transcript — it emits events and keeps only the
active `messages`. Lose the turns, lose the transcript.

**Session** — the continuable identity of a conversation (`sessionId`).
`AgentSession` is its serialized form: the pure continuation
`{ sessionId, messages }` that `agent.snapshot()` captures and the `Agent`
constructor restores. The transcript is not part of it.

**Compaction** — replacing the active conversation with a condensed rewrite,
recorded on the transcript as a `compaction` turn part. Old messages cease to
exist; lookback is served by the transcript.

**Trace** — observability only: the span tree produced by the tracer and consumed
by span writers. Never the conversation transcript.

**Annotation** — host-owned render state attached to a turn or a part. Never
model state, never sent to a provider.

**Tool** — an executable capability. Four sources: local `ExecutableTool`s,
provider-managed tools, MCP tools, and subagents. All share one `ToolRegistry`
and one flat namespace.

## Renamed terms

| Was | Is | Since |
| --- | --- | --- |
| turn (execution loop) | **step** | 0.29.0 |
| `maxIterations` | `maxSteps` | 0.29.0 |
| `"max-iterations"` | `"max-steps"` | 0.29.0 |
| `generateTurn` | `generateStep` | 0.29.0 |
| `TurnAccumulator` | `Transcript` | 0.30.0 |
| `agent.history.log` | `agent.messages` | 0.26.0 / 0.30.0 |

See [Upgrading](/upgrading).
