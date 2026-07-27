---
title: Agent
description: The primary interface for building multi-turn agents.
---

# Agent

`Agent` is the primary interface. It owns the provider, model, system prompt,
tools, and conversation history. `send()` starts immediately when the agent is
idle and otherwise queues FIFO. It accepts either a plain string or an
[`Instruct`](/guide/instruct).

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";
import type { ExecutableTool } from "@fifthrevision/axle";
import { z } from "zod";

const myTool: ExecutableTool = {
  name: "lookup",
  description: "Look up a value",
  schema: z.object({ key: z.string() }),
  async execute(input) { return "result"; },
};

const agent = new Agent({
  provider: anthropic(apiKey),
  model: "claude-sonnet-4-5-20250929",
  system: "You are a helpful assistant.",
  tools: [myTool],
});
```

## Request options

`Agent` accepts normalized model request options as constructor defaults. These
apply to every `send()` unless overridden per-turn.

```typescript
const agent = new Agent({
  provider,
  model,
  reasoning: true,
  maxOutputTokens: 1000,
  temperature: 0.7,
  topP: 0.9,
  stop: ["END"],
});
```

Use `providerOptions` for raw provider-specific fields that are not covered by
the normalized surface:

```typescript
const agent = new Agent({
  provider,
  model,
  providerOptions: { seed: 42 },
});
```

See [Low-level APIs](/guide/low-level) for the full list of normalized options.

## `send()`

```typescript
const handle = agent.send("Write me a poem.");

const result = await handle.final;
if (!result.ok) throw new Error(result.error.kind);
console.log(result.response);
```

- For string inputs, `result.response` is the assistant's text.
- For `Instruct` inputs with a schema, `result.response` is the parsed object.
- See [Results & Errors](/guide/results) for details on the result shape.

### Per-turn overrides

Pass any normalized request option to `send()` to override the agent's defaults
for that turn only:

```typescript
await agent.send("Summarize this", { temperature: 0 });
await agent.send("Be creative", { temperature: 1.2, maxOutputTokens: 2000 });
```

`providerOptions` are shallow-merged with the agent's defaults:

```typescript
const agent = new Agent({
  provider,
  model,
  providerOptions: { seed: 1 },
});

// The request receives: { seed: 1, metadata: { source: "send" } }
await agent.send("Go", {
  providerOptions: { metadata: { source: "send" } },
});
```

### User turn metadata

Pass `metadata` to attach stable, host-owned data to a user message. Providers
ignore it; Axle stores it in history and copies it onto the corresponding user
`Turn`. Use this for render-side facts (surface, source, experiment ID, etc.).

```typescript
await agent.send("Rewrite this prompt", {
  metadata: { surface: "prompt-editor" },
});
```

## Multi-turn conversations

The agent maintains its own history. Each `send()` is appended to that
history, so subsequent calls share the prior context automatically.

```typescript
await agent.send("Hi, my name is Ana.").final;
await agent.send("What's my name?").final;
// → "Your name is Ana."
```

## Stopping and clearing

### `agent.stop()`

`stop()` asks the active turn to finish at its next complete tool-batch
boundary. Every tool in the in-flight batch completes (including parallel
calls), commits, and then the handle settles without another provider
request. A turn whose response requests no tools completes normally.

```typescript
const h1 = agent.send("Build the feature.");

// later, from an event handler while h1 is executing:
agent.stop(); // returns false if no turn is executing yet
const h2 = agent.send("Make the button blue.");
```

`stop()` returns `false` when no turn is executing. It never affects queued
sends — they run afterward in FIFO order.

Each handle resolves only its own result: `h1` settles at the stop boundary
and does not absorb `h2`'s response. A stopped turn ends on its tool-call
exchange, so a plain send resolves with whatever text that turn produced
(often empty) and an `Instruct` send may resolve `ok: false` with a parse
error — no final answer exists yet by design.

`stop()` never interrupts a running provider request or tool batch; use
cancellation when a hard stop is required.

### `agent.clear()`

`clear()` cancels every queued operation without touching the active turn.
Each cleared handle rejects with an `AxleAgentAbortError`, committing
nothing. It returns the number of operations cleared.

Together, `stop()` and `clear()` recover full takeover:

```typescript
agent.stop();  // active turn settles at its tool-batch boundary
agent.clear(); // queued sends are dropped
agent.send("Make the button blue."); // runs as the very next turn
```

## Cancellation

`send()` returns a handle. Call `handle.cancel(reason)` to abort that handle
only — other queued handles are unaffected.

Cancellation is handle-local. The user message commits when the provider
request is made, so:

- Cancelling a queued handle removes it without committing its user message.
- Cancelling the running handle before its provider request (during setup or
  automatic compaction) also commits nothing.
- Cancelling after the provider request aborts the active work; the
  committed user message remains and the agent turn is marked cancelled.

```typescript
const handle = agent.send("Long task...");
setTimeout(() => handle.cancel("user-cancelled"), 5000);

try {
  const result = await handle.final;
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    // handle cancellation; partial state is on err
  } else {
    throw err;
  }
}
```

To cancel a group, give every operation the same external signal:

```typescript
const controller = new AbortController();

const h1 = agent.send("Build the feature.", { signal: controller.signal });
const h2 = agent.send("Make the button blue.", { signal: controller.signal });

controller.abort("cancel the run");
```

## Context counter

`agent.context()` returns an estimate of the current context window usage,
broken down by system prompt, messages, tools, MCP tools, and provider tools:

```typescript
const ctx = agent.context();
console.log(`Using ~${ctx.total} tokens (${ctx.free} free)`);
// { total, system, messages, tools, mcpTools, providerTools, limit?, free? }
```

## Compaction (experimental)

Compaction replaces the agent's active conversation with a shorter one — for
example a summary — so long sessions can continue past the model's context
limit. The API is experimental and may change in any release.

### Built-in `PromptCompactor`

Axle ships a prompt-based implementation for the common case:

```typescript
import { Agent, PromptCompactor } from "@fifthrevision/axle";

const compactor = new PromptCompactor({
  provider,
  model,
  prompt:
    "Create a continuation summary. Preserve decisions, constraints, completed work, and open tasks.",
  thresholdTokens: 100_000,
  targetTokens: 20_000,
});

agent.setCompaction({
  compact: compactor.compact,
  triggers: {
    beforeTurn: true,
  },
});
```

`PromptCompactor` returns one user message containing a model-written summary
followed by the latest 10 user messages in oldest-to-newest order. The target
is an approximate budget for that complete message, including the recent
message appendix. Set `recentUserMessages` to change the count.

For `PromptCompactor`, automatic triggers decline while usage is below
`thresholdTokens`, while a manual `agent.compact()` bypasses that threshold.

### Manual compaction

```typescript
const record = await agent.compact(); // CompactionRecord | null when declined
const record = await agent.compact({ signal }); // can be aborted
```

`agent.compact({ signal })` follows the same cancellation contract as every
other operation: aborting rejects with an error whose `name` is
`"AbortError"`. `null` strictly means no compaction happened by choice — no
callback configured, or the callback declined.

### Custom configuration

```typescript
agent.setCompaction({
  compact: async ({ messages }, { usage, signal, trigger, lastCompaction }) => {
    if (trigger !== "manual" && usage.total < 100_000) return null;
    return summarize(messages, signal);
  },
  triggers: {
    beforeTurn: true,
    afterTurn: true,
  },
});
```

The callback receives a `trigger` field (`"manual" | "beforeTurn" | "afterTurn"`).
`lastCompaction.messageCount` marks how many leading messages are carried-over
compacted content.

Omitting `triggers` makes compaction manual-only. `beforeTurn` invokes the
callback before the next `send()` commits its user message; `afterTurn`
invokes it after a successful turn is committed and before that handle
resolves.

### Compaction callback holds the scheduler

Like tool callbacks, the compaction callback runs while the agent's scheduler
is held: scheduling more work on the same agent from inside it queues behind
the current operation, so awaiting that work from inside the callback
deadlocks. Fire-and-forget scheduling is safe.

### History

Compaction is destructive at the message layer: the returned messages become
the entire active conversation. Nothing is lost:

- `history.messages` — the active conversation sent to the model.
- `history.archive` — the raw append-only log; compaction never touches it.
- `history.compactions` — receipts (`{ id, at, messageCount }`) for each
  compaction; `messageCount` marks how many leading messages are
  carried-over compacted content.

Compaction emits `compaction:start` / `compaction:end` events and lands in
`history.turns` as an agent turn containing a single `compaction` part.

See [Migrating to Axle 0.28.0](/migration/0.28.0) for the `onCompaction()`
migration and detailed `stop()` semantics.

## Streaming events

`agent.on(...)` registers a callback that fires for every subsequent `send()`.
See [Streaming](/guide/streaming) for the full event list.

## Session snapshot and restore

`Agent` supports serializable session state for save/resume workflows.

```typescript
// Save the current session
const saved: SavedAgent = {
  definition: myAgentDefinition, // AgentDefinition (serializable recipe)
  session: agent.snapshot(),     // AgentSession (messages, turns, sessionId)
};

// Restore from a saved session — constructor form (0.21.0+)
const config = await createAgentConfig(saved.definition, resolver);
const restoredAgent = new Agent(config, saved.session);

// Alternatively, use the explicit restore() method
const restoredAgent2 = new Agent(config);
restoredAgent2.restore(saved.session);
```

Both forms are equivalent. When both `config.sessionId` and
`session.sessionId` are supplied, the restored session id wins.

`AgentDefinition` is a serializable recipe — it describes the provider, model,
tools, and request defaults in a form that can be stored in a database or sent
over the wire. Hosts resolve it into a runtime `AgentConfig` using
`createAgentConfig(definition, resolver)`.

`AgentSession` holds continuation state: the model-facing message history,
renderable turns, session annotations, and the stable `sessionId`.

See [Hosting & Sessions](/guide/hosting) for the full pattern.
