---
title: Agent
description: The interface you'll use most — scheduling, interruption, and what it owns.
---

# Agent

`Agent` holds a provider, a model, a system prompt, a tool registry, and the
active conversation. `send()` is the verb.

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";

const agent = new Agent({
  provider: anthropic(apiKey),
  model: "claude-sonnet-4-5",
  system: "You are a helpful assistant.",
  tools: [getWeather],
});
```

One thing it deliberately doesn't hold: a transcript. It emits events and keeps
only the active messages. [Transcripts](/concepts/transcripts) explains why, and
what you do about it.

## send()

```typescript
const handle = agent.send("Write me a poem.");
const result = await handle.final;
if (!result.ok) throw new Error(result.error.message);
console.log(result.response);
```

`send()` takes a plain string or an [`Instruct`](/concepts/instruct), and hands
back a handle immediately. What you get in `response` follows what you put in:

- a string → the assistant's text
- an `Instruct` with a schema → the parsed, typed object
- an `Instruct` without one → text

Two small conveniences you don't have to think about, but might appreciate
knowing. Strings get wrapped in an `Instruct` with `vars: "optional"`, so if a
user types <code v-pre>{{braces}}</code> at you, nothing explodes. And an
`Instruct` you pass in gets cloned, so you can reuse and even mutate the same
object afterwards without affecting a send in flight.

## Sends line up in a queue

Call `send()` while a turn is running and it waits its turn. Sends never run
concurrently or interleave.

```typescript
const a = agent.send("First question.");
const b = agent.send("Second question."); // waits for a
```

Each handle settles with its own result, and `b` sees the history `a` committed.

The queue is doing more work than it looks like: `snapshot()` and `compact()` go
through it too. That's what guarantees a snapshot is never taken mid-stream and
compaction never races a turn.

::: danger One way to deadlock
`agent.snapshot()` and `agent.compact()` queue behind in-flight work. So if you
await either from inside a tool's `execute`, an `onToolCall` handler, or a
compaction callback, you'll hang — the send is holding the queue that your
nested call is waiting on. Call them from outside a send instead.
:::

## Interrupting: three different things

`stop()`, `clear()`, and `cancel()` sound similar and do quite different jobs.
Here's the short version:

| You want to | Use |
| --- | --- |
| Let the current work finish, then stop | `agent.stop()` |
| Throw away what's queued up behind it | `agent.clear()` |
| Stop right now, mid-request | `handle.cancel()` |

### stop() — wind down gracefully

```typescript
agent.stop(); // false if nothing was running
```

This asks the active turn to finish at its **next tool-batch boundary**. Every
tool in the batch that's currently running — including parallel ones — completes
and commits. Then the handle settles without another provider request. Nothing
gets wasted, and the history stays coherent.

`stop()` won't interrupt a request or a tool that's already in flight, and it
leaves queued sends alone.

One consequence to expect: since a stopped turn ends on its tool-call exchange,
a plain send resolves with whatever text that step produced — often nothing. An
`Instruct` send may come back `ok: false` with a parse error. That's not a bug;
there genuinely isn't a final answer yet.

### clear() — empty the queue

```typescript
const dropped = agent.clear(); // how many you cancelled
```

Cancels everything queued, leaves the active turn alone. Each cleared handle
rejects with `AxleAgentAbortError`, having committed nothing.

### The steer playbook

This is the one to memorize. When your user types something while the agent is
mid-task, you want to redirect it without losing the work it already did:

```typescript
agent.stop(); // finish the current tool batch, then settle
agent.clear(); // drop anything queued behind it
agent.send("Actually, make the button blue."); // becomes the very next turn
```

Stop, clear, send. That's steering.

Each call does one part of it. `stop()` lets the active turn wind down
gracefully — in-flight tools finish and commit, so nothing is wasted or
half-written. `clear()` throws away work that was queued behind it, which the
user has now implicitly superseded. And the `send()` lands on a clean, linear
history that includes everything the agent actually did.

The order matters. Call `clear()` before `stop()` and you leave a window where
the active turn can finish and pull in the queued work you were about to drop.

Reach for `handle.cancel()` instead only when you need the agent to stop *now*
and don't care about the in-flight tool call — closing a tab, say, rather than
redirecting.

### cancel() — stop now

```typescript
const handle = agent.send("Long task...");
handle.cancel("user-navigated-away");
```

Immediate, and local to that handle. `handle.final` rejects with
`AxleAgentAbortError`.

Whether anything commits comes down to timing, and the line is the `turn:user`
event:

- Cancel **before** it (while queued, or during MCP setup) and the handle just
  disappears. No user message, nothing committed.
- Cancel **after** it and the user message stays, with the agent turn marked
  `cancelled`. That includes cancelling during `beforeTurn` compaction —
  compaction is ordinary work inside an already-open turn, so cancelling it
  doesn't unwind anything.

Either way, the rejected error hangs on to `reason`, `usage`, `turn`, and
whatever partial output existed. You paid for that; you may as well show it.

## Listening in

```typescript
const unsubscribe = agent.on((event) => {
  if (event.type === "text:delta") process.stdout.write(event.delta);
});
```

`on()` gives you back an unsubscribe function. Callbacks fire for every send from
then on, so you wire them once rather than per turn.
[Turn events](/concepts/turn-events) covers what you'll receive.

## Reading the conversation

```typescript
agent.messages; // AxleMessage[] — a copy
agent.context(); // estimated token usage, broken down
agent.sessionId; // stable id, generated if you didn't supply one
```

`messages` is a copy, so mutating it does nothing. If you want to change the
conversation, that's [compaction](/concepts/compaction).

## Tools and MCP

Supply tools at construction or add them later. MCP servers resolve lazily —
their tool lists get fetched on the first send that needs them, once per client.

```typescript
const agent = new Agent({ provider, model, tools: [a], providerTools: [b] });
agent.addMcp(mcpClient);
agent.hasTools(); // true
agent.registry; // the ToolRegistry, if you want to poke at it
```

See [Tools](/concepts/tools).

## Picking up where you left off

```typescript
const session = await agent.snapshot();
// ...later, in a new process
const restored = new Agent(config, session);
```

See [Sessions & persistence](/concepts/sessions).

## Next

- [Instruct](/concepts/instruct) — when a string isn't enough
- [Results & errors](/concepts/results-and-errors) — what `send()` gives you back
- [Agent reference](/reference/agent) — every option and method
