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

Compaction has three layers, each with one job:

- **Triggers** (`beforeTurn` / `afterTurn`) say *when to ask automatically*.
- **`shouldCompactOnTrigger`** filters those automatic requests
  synchronously.
- **`compact`** does *the work* — as fallible turn work, streamed like a
  tool call. Explicit `agent.compact()` always bypasses the automatic policy
  and invokes `compact` directly.

The record of a compaction is a `CompactionPart` that arrives `running`,
receives replacement `compaction:update` progress or summary events, and
settles `complete` (the message swap applied, atomically) or `error` (a
recorded, non-fatal failure for automatic triggers).

### Built-in `PromptCompactor`

Axle ships a prompt-based implementation for the common case. Wire both
`shouldCompactOnTrigger` and `compact`:

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
  shouldCompactOnTrigger: compactor.shouldCompactOnTrigger,
  compact: compactor.compact,
  triggers: {
    beforeTurn: true,
  },
});
```

`PromptCompactor` returns stamped messages containing a model-written summary
and a recent-user-messages appendix. Its `shouldCompactOnTrigger` declines
while usage is below `thresholdTokens`; explicit `agent.compact()` bypasses
that threshold.

::: warning 0.29 upgrade
`setCompaction({ compact: c.compact, triggers })` previously included
`PromptCompactor`'s threshold policy inside `compact`. In 0.30 that
configuration accepts every automatic trigger. Add
`shouldCompactOnTrigger: c.shouldCompactOnTrigger`, or the conversation will
compact at every configured boundary.
:::

### Manual compaction

```typescript
const applied = await agent.compact(); // Promise<boolean>
const applied = await agent.compact({ signal }); // can be aborted
```

`agent.compact()` returns `true` after the configured compactor applies,
`false` when no compactor is configured. Automatic-trigger failures no longer
reject the send — the errored `CompactionPart` is the record. Explicit
`agent.compact()` failures reject.

### Custom configuration

```typescript
agent.setCompaction({
  shouldCompactOnTrigger(state, ctx) {
    // Synchronous policy. Return false to skip automatic triggers.
    return state.totalTokens > 100_000;
  },
  compact: async ({ messages }, { usage, signal, trigger, id, emit }) => {
    // id — engine-generated compaction id, shared with the CompactionPart
    // emit({ summary?, progress? }) — streams transient reader-facing state
    emit({ progress: 0.3, summary: "Reading conversation…" });

    const summary = await doSummarize(messages, signal);

    // Return the new conversation. summary is optional reader-facing text.
    return {
      messages: createNewConversation(summary, messages),
      summary: "Reduced context by ~60%",
    };
  },
  triggers: {
    beforeTurn: true,
    afterTurn: true,
  },
});
```

Omitting `triggers` makes compaction manual-only.

### Compaction parts

The compactor's returned `summary` is reader-facing text on the
`CompactionPart` — a presentation choice, independent of the model-facing
messages. If the callback returns no summary, the latest emitted transient
summary remains; without one, the completed part renders as a bare divider.

```typescript
agent.on((event) => {
  if (event.type === "part:start" && event.part.type === "compaction") {
    // event.part: { id, type: "compaction", status: "running", summary?, progress? }
    console.log(`[compaction] running — ${event.part.summary ?? ""}`);
  }
  if (event.type === "compaction:update") {
    console.log(`[compaction] progress=${event.update.progress}, summary=${event.update.summary}`);
  }
  if (event.type === "compaction:complete") {
    console.log("[compaction] applied");
  }
  if (event.type === "compaction:error") {
    console.log(`[compaction] failed: ${event.error}`);
  }
});
```

### Compaction callback holds the scheduler

Like tool callbacks, the compaction callback runs while the agent's scheduler
is held: scheduling more work on the same agent from inside it queues behind
the current operation, so awaiting that work from inside the callback
deadlocks. Fire-and-forget scheduling is safe.

## Streaming events

`agent.on(...)` registers a callback that fires for every subsequent `send()`.
See [Streaming](/guide/streaming) for the full event list.

## Session snapshot and restore

`Agent` supports serializable session state for save/resume workflows.

```typescript
// Save the current session
const saved: SavedAgent = {
  definition: myAgentDefinition, // AgentDefinition (serializable recipe)
  session: await agent.snapshot(),     // AgentSession ({ sessionId, messages })
};

// Restore from a saved session — pass session as second constructor argument
const config = await createAgentConfig(saved.definition, resolver);
const restoredAgent = new Agent(config, saved.session);
```

When both `config.sessionId` and `session.sessionId` are supplied, the
restored session id wins.

`AgentDefinition` is a serializable recipe — it describes the provider, model,
tools, and request defaults in a form that can be stored in a database or sent
over the wire. Hosts resolve it into a runtime `AgentConfig` using
`createAgentConfig(definition, resolver)`.

`AgentSession` holds continuation state: the active model-facing
`messages` and the stable `sessionId`. Unknown keys in sessions stored by
older Axle versions are silently ignored.

### Persisting turns

The agent no longer owns a transcript — turns are host-owned. Attach a
`Transcript` to the event stream, persist its `turns` next to the session,
and re-seed it on restore:

```typescript
const agent = new Agent(config);
const transcript = new Transcript();
agent.on((event) => transcript.apply(event));

// … run the agent …

const saved: SavedAgent = {
  definition: myAgentDefinition,
  session: await agent.snapshot(),
};
await db.save(userId, saved, transcript.turns);

// On restore:
const restoredTranscript = new Transcript(savedTurns);
agent.on((event) => restoredTranscript.apply(event));
```

See [Hosting & Sessions](/guide/hosting) for the full pattern.
