---
title: Agent
description: The interface you'll use most — scheduling, interruption, and what it owns.
---

# Agent

`Agent` holds a provider, a model, a system prompt, a tool registry, a skill
registry, and the active conversation. `send()` is the verb.

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

The queue is doing more work than it looks like: `compact()` goes through it
too, so compaction never races a turn. (`snapshot()` used to queue as well; in
0.34.0 it waits for the agent to go idle instead — see [Sessions &
persistence](/concepts/sessions).) Every accepted operation also announces
itself: `send()` emits `pending:queued` with a preview turn carrying the id the
committed turn will have, so a UI rendering `[...transcript.turns,
...transcript.pending]` keyed by id shows queued work. A handle cancelled while
still queued emits `pending:dropped` and commits nothing. See [Turn
events](/concepts/turn-events).

::: danger One way to deadlock
`agent.compact()` queues behind in-flight work, and `agent.snapshot()` waits
for idle — so if you await either from inside a tool's `execute`, an
`onToolCall` handler, a compaction callback, or an `onSettled` callback, you'll
hang. The send is holding the queue (or the idle) that your nested call is
waiting on. Call them from outside a send instead.
:::

## Interrupting: four different things

`stop()`, `clear()`, `cancel()`, and handle-level `cancel()` sound similar and
do quite different jobs. Here's the short version:

| You want to | Use |
| --- | --- |
| Let the current work finish, then stop | `agent.stop()` |
| Stop the active operation right now | `agent.cancel()` |
| Throw away what's queued up behind it | `agent.clear()` |
| Stop one specific send right now, mid-request | `handle.cancel()` |

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
rejects with `AxleAgentAbortError`, having committed nothing. A waiting
`snapshot()` is not queued work, so `clear()` doesn't touch it.

### agent.cancel() — stop the active operation now

```typescript
agent.cancel("user-navigated-away"); // false if nothing was running
```

Immediate, like `handle.cancel()`, but aimed at whatever is active rather than
a specific handle: the active operation aborts, a turn that already opened
settles `cancelled` with its partial work committed, and queued operations are
unaffected — the next one starts. `stop()` remains the gentle form. Graceful
shutdown is `clear()`, then `stop()` or `cancel()`, then `snapshot()` (or the
last `onSettled`).

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

Whether anything commits comes down to timing, and the line is whether the turn
opened:

- Cancel **before** it (while queued, or during MCP setup) and the handle just
  disappears — `pending:queued` is followed by `pending:dropped`, no user
  message, nothing committed.
- Cancel **after** it and the user message stays, with the agent turn marked
  `cancelled`. A cancelled turn is always recorded as `cancelled`, even when the
  provider rethrows something that doesn't look like an abort. That includes
  cancelling during `beforeTurn` compaction — compaction is ordinary work inside
  an already-open turn, so cancelling it doesn't unwind anything.

One timing subtlety: the user turn is stamped when `send()` is called, so the
queued preview and the committed turn share their id, parts, and timing. For a
send that waited in the queue, the turn's timing is the moment of the call, not
the moment it committed.

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

Two more subscriptions cover the operation lifecycle. `onSettled()` fires once
after each send or manual compaction that ran, however it ended — after its
`turn:end`, before its handle settles — handing you the session and exactly
what the handle is about to settle with. That's the hook for saving after each
operation without awaiting the queue empty the way `snapshot()` does. The agent
awaits your callback, so returning a promise holds the handle and the next
queued operation; a callback that throws can't affect the operation. `onIdle()`
fires each time the agent goes from busy to idle, after the last operation's
`onSettled` callbacks — the place to close whatever your host opened when work
began. Neither fires for an operation cancelled while still queued: it never
ran. See the [Agent reference](/reference/agent#onsettled).

## Reading the conversation

```typescript
agent.messages; // AxleMessage[] — a copy
agent.context(); // estimated token usage, broken down
agent.sessionId; // stable id, generated if you didn't supply one
agent.system; // readonly getter — configured prompt, then the skills catalog when skills exist
```

`messages` is a copy, so mutating it does nothing. If you want to change the
conversation, that's [compaction](/concepts/compaction). `system` is derived —
set the prompt at construction; skills append their own section (see
[Skills](/concepts/skills)).

## Tools and MCP

Supply tools at construction or add them later. MCP servers resolve lazily —
their tool lists get fetched on the first send that needs them, once per client.

```typescript
const agent = new Agent({ provider, model, tools: [a], providerTools: [b] });
agent.addMcp(mcpClient);
agent.hasTools(); // true
agent.registry; // the ToolRegistry, if you want to poke at it
agent.skills; // the SkillRegistry — add/remove/set at any time, lands on the next request
```

See [Tools](/concepts/tools) and [Skills](/concepts/skills).

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
