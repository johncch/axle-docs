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
compaction. A turn's `status` runs `pending` → `streaming` → `complete` |
`cancelled` | `error`; a user turn skips `streaming`, and a `pending` turn lives
only in `Transcript.pending`. Never a single assistant message; never a
provider request.

**Send** — the Agent API verb: one scheduled conversation exchange
(`agent.send(...)`), executed as a FIFO queue item. The host-facing unit of "the
agent took its turn."

**Operation** — a queued unit of agent work that opens a turn: a send or a
manual compaction. Operations run one at a time in FIFO order. An operation is
_pending_ from the call until its turn opens, and _settles_ when it ends,
however it ends; `agent.onSettled(...)` then hands the host the session and the
outcome, and waits for the host before the next operation starts. An operation
cancelled while still queued never ran and does not settle. `agent.snapshot()`
opens no turn, is not queued, and is not an operation.

**Idle** — the Agent has no operation running and none queued. It is _busy_
from the first call that schedules an operation until the last queued one has
settled; `agent.onIdle(...)` fires at each change from busy to idle, and
`agent.snapshot()` resolves there.

**Pending turn** — a preview of a turn the Agent has accepted but not yet
opened: the user turn a queued `send()` will commit, or an agent turn with one
`pending` compaction part for a queued manual compaction. It is a `Turn` with
`status: "pending"` and the id the real turn will carry, and it lives in
`Transcript.pending`, never in `turns`. Pending turns are live state: they are
not saved, a transcript restored from saved turns has none, and a host seeds
them through the constructor only to mirror a live transcript.

**Skill** — a unit of on-demand instruction in the Agent Skills format: a
`SKILL.md` (frontmatter `name` and `description`, Markdown body) with optional
bundled files. In core a `Skill` is plain data — name, description,
`instructions`, an opaque `root`, a `files` listing — disclosed in the system
prompt as a _catalog_ line and _activated_ when the model calls `view-skill`.
`agent.skills` is the `SkillRegistry` that holds them; like `agent.registry`
for tools, it changes at any time and the next provider request reads it. A
skill is not a tool: it adds instructions, and reaches files only through the
tools the host registered. See [Skills](/concepts/skills).

**Decision** — one `decide()` call: an input and a set of typed questions sent
to a decision model in a single request, answered with one typed value per
question. A decision is not a step, a send, or a message: it has no conversation
and produces no turn. See [Decisions](/concepts/decisions).

**Decision model / decision provider** — a model that answers typed questions
and cannot generate text, and the `DecisionProvider` that reaches it. Distinct
from `AIProvider`; a provider may be either or both.

**Noul** — a yes/no question. Its answer `noul` is the probability of yes, from
0 to 1. A value near 0.5 means the model is unsure, not that the answer is
"partly".

**Choice** — a question that picks one option from a set the caller defines.
Its answer carries the chosen option, a probability per option, and a
confidence.

**Score** — a question that places the input on an ordered scale the caller
defines, lowest level first. Its answer `score` is a probability-weighted
position on that scale, zero-based, and can fall between levels.

**Criteria** — the caller's description of a question's possible answers: what
yes and no mean for a noul, the options for a choice, the ordered levels for a
score.

**Refusal (decision)** — a provider declining one question in a decision. The
answer for that question is `{ type: "refusal" }`; the rest of the decision
stands. Unrelated to the chat-side `Refusal`, which describes a declined request
or blocked output.

**Display** — the request-side reasoning disclosure control:
`display: "visible" | "hidden"` on the `{ effort }` form of `reasoning`. It says
whether the provider should show its thinking, never in what form. The form that
arrives — a `summary` or `raw` text — is recorded on the thinking part and is
the model's property. `"hidden"` withholds thinking content from the turn while
the message keeps whatever the wire carried, so continuity still round-trips.

**Summary / raw** — the two content fields of a turn's thinking part, each named
for what the provider handed back: `summary` is the provider's condensed account
of its reasoning, `raw` is the chain of thought itself (open-weight models
only). Neither present is the withheld state. The message-layer thinking part
keeps the wire vocabulary (`text`, `summary`, `redacted`) because it exists to
be echoed, not read.

**Redacted** — a wire-layer flag only: the provider substituted an opaque
payload for the content and wants it echoed on the next turn. Never a turn-part
or event field, and never set because thinking was merely hidden.

**Transcript** — the host-owned, reader-facing fold of `TurnEvent`s into turns
and annotations. The exported `Transcript` class is the shipped in-memory
implementation; hosts persist its `turns` and pass them to the constructor on
restore. Its `pending` view holds operations the Agent has accepted but not
started; that is live state and is never saved. The Agent holds no
transcript — it emits events and keeps only the active `messages`. Lose the
turns, lose the transcript.

**Session** — the continuable identity of a conversation (`sessionId`).
`AgentSession` is its serialized form: the pure continuation
`{ sessionId, messages }` that `agent.snapshot()` captures and the `Agent`
constructor restores. `snapshot()` resolves when the Agent goes idle, so the
capture is always at rest. The transcript is not part of it.

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
| `ThinkingPart.text` | `ThinkingPart.summary` / `ThinkingPart.raw` | 0.32.0 |
| `ThinkingPart.redacted` (turn) | removed — `redacted` is wire-layer only | 0.32.0 |
| `thinking:delta` (stream and turn) | `thinking:raw-delta` | 0.32.0 |
| `generateStep` | removed — use `stream()` with `maxSteps: 1` | 0.32.0 |
| `Models` / `ModelInfo` / `ModelMetadata` (`@fifthrevision/axle/models`) | removed — pass model IDs as plain strings | 0.33.0 |
| `temperature` / `topP` / `stop` (request options) | removed — send through `providerOptions` with provider field names | 0.33.0 |
| `AxleFailure` `{ kind: "tool" }` | removed — nothing produced it | 0.33.0 |
| `AxleFailure` nested `error` (`ModelError`, parse `error`) | flattened — `model` carries `type`/`status`/`usage`/`raw` directly; parse carries `cause` | 0.33.0 |
| `provider-tool` part `output` | `input` / `result` / `continuity`; results in `continuity`, late results in `provider-tool-result` parts | 0.33.0 |
| `provider-tool:complete` `output` (search) | search results live on the part's `continuity`; failures arrive as `provider-tool:error` | 0.33.0 |
| `AxleStopReason.Error` / `AxleStopReason.Custom` | removed — unknown stop reasons fail the request | 0.33.0 |
| `configureAxle` / `AxleConfiguration` | removed — attach `webSearch` to each `chatCompletions()` provider that needs it | 0.34.0 |
| `WebSearchBackend` (+ `WebSearchRequest`, `WebSearchResponse`) | removed — a custom search is an `ExecutableTool` passed as `webSearch` | 0.34.0 |
| `StreamParams.registry` | removed — pass `tools` / `providerTools`; change mid-loop via `onToolBatchComplete` | 0.34.0 |
| `ToolContext.registry` | removed — mutate the agent in closure scope (`agent.registry`, `agent.skills`) | 0.34.0 |
| `AIProvider.resolveProviderToolName` / `ResolvedProviderTool` / `nativeName` | removed — providers serve `providerTools` unchanged; bring tools via `AIProvider.tools` | 0.34.0 |
| `agent.system` (writable) | read-only getter — configured prompt plus the skills catalog | 0.34.0 |
| `vendor: "together"` | renamed to `"togetherai"` | 0.34.0 |
| `WEB_SEARCH_FALLBACK_NOT_CONFIGURED` | removed — an unserved provider tool fails the request as a `model` failure with no code | 0.34.0 |
| `TOOL_OPTIONS_CONFLICT` | removed — there is nothing left to conflict | 0.34.0 |

See [Upgrading](/upgrading).
