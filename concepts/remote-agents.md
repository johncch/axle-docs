---
title: Remote agents
description: Driving an agent served elsewhere — an event store on its side, a RemoteAgent on yours.
---

# Remote agents

::: warning Experimental
Remote agents are under active design and may change in any release. The wire
shapes (`AgentCommand`, `CommandOutcome`) are Zod schemas, so expect fields to
move.
:::

Sometimes the agent can't live where its consumer does. The model key belongs
on a server, the UI belongs in a browser, and the two meet over HTTP. Or one
process serves the agent and another drives it, and the calls in between need
a human's answer.

`RemoteAgent` is how you drive an agent served elsewhere. It has the `Agent`
surface you already know — `on`, `onToolCall`, `toolCall(id)`, `send`,
`cancel`, `stop`, `clear`, `status` — and holds no transcript, exactly like
`Agent`. Events come in, commands go out, and everything else reads the same
from the consumer side.

## The pieces

Two things on the served side, one on yours, a transport between them, and a
switch in the middle:

- **The served `Agent`** — an ordinary agent, with the provider key, the tools
  with their `execute` functions, and whatever else only exists server-side.
- **`InMemoryEventStore`** — sits beside the agent, stamps every event with a
  cursor, and replays after it on reconnect.
- **A transport** — `httpTransport` over one URL (`GET` for the event stream,
  `POST` for commands), or `loopbackTransport` for the same contract with no
  wire: the store's events straight out, each command straight to a handler.
- **The host's command switch** — yours to write: it turns each `AgentCommand`
  into an `Agent` call. Creating, finding, and ending agents is the host's
  job too, since an `Agent` is built from secrets and connections that never
  cross a wire.

Here's the whole thing over `loopbackTransport` — a served agent and its
consumer in one process. HTTP changes the transport, not the shape.

```typescript
import {
  Agent,
  InMemoryEventStore,
  RemoteAgent,
  isCall,
  loopbackTransport,
  type DeferredTool,
} from "@fifthrevision/axle";

const askUser = {
  type: "deferred",
  name: "ask_user",
  description: "Ask the person a question and wait for their answer",
  schema: z.object({ question: z.string() }),
} satisfies DeferredTool;

const served = new Agent({ provider, model, tools: [askUser] });
const store = new InMemoryEventStore(served);

const remoteAgent = new RemoteAgent(
  loopbackTransport(store, async (command) => {
    switch (command.type) {
      case "send": {
        const handle = served.send(command.prompt, { id: command.id });
        handle.final.catch(() => {});
        return { accepted: true as const };
      }
      case "answer": {
        const call = served.toolCall(command.callId);
        if (!call) {
          return {
            accepted: false as const,
            reason: { type: "not-waiting" as const, message: `No waiting call ${command.callId}` },
          };
        }
        await call.answer(command.content);
        return { accepted: true as const };
      }
      case "fail": {
        const call = served.toolCall(command.callId);
        if (!call) {
          return {
            accepted: false as const,
            reason: { type: "not-waiting" as const, message: `No waiting call ${command.callId}` },
          };
        }
        await call.fail(command.message);
        return { accepted: true as const };
      }
      case "cancel":
      case "stop": {
        const took = command.type === "cancel" ? served.cancel() : served.stop();
        return took
          ? { accepted: true as const }
          : {
              accepted: false as const,
              reason: { type: "idle" as const, message: "No active turn" },
            };
      }
      case "clear":
        served.clear();
        return { accepted: true as const };
    }
  }),
);

const transcript = new Transcript();
remoteAgent.on((event) => transcript.apply(event));

remoteAgent.onToolCall((call) => {
  if (!isCall(askUser, call)) return;
  return prompt(call.input.question);
});

const result = await remoteAgent
  .send("Ask me my favourite colour, then tell me one fact about it.")
  .final;
remoteAgent.close();
```

The served side keeps working exactly as it would locally — deferred calls and
all. The consumer answers `ask_user` from its own `onToolCall`, folds events
into its own transcript, and reads the result off `final`. The switch in the
middle is the only new code, and over HTTP it looks the same, with
`parseAgentCommand` checking the body and `toEventStreamResponse` writing the
stream. A runnable server and client live in `examples/remote` in the library
repo.

## What crosses the wire

Commands go in; everything else comes out as events. A command's response only
says whether the agent took it — `{ accepted: true }`, or `not-waiting` for an
answer to a call nobody is waiting on, `idle` for a cancel or stop with no
active turn. Results, the waiting call, the settled turn: those arrive as
events, so every consumer of the store sees them, not just the one that asked.

A `send` crosses as a rendered prompt — the user turn's `id`, the prompt text
with everything already in it, its files, and the metadata the send carries.
The schema never crosses: the remote `send` still takes an `Instruct`, and
`final` still gives you the parsed object. Per-send request options don't
cross either; the served agent's configuration applies.

Two things don't survive the trip. A remote result carries no `after` list —
the inline sends' schemas live on the served side, so only their turns cross.
And an `error` outcome crosses as its message, not as the error the served
side threw.

## Status and connection are separate

```typescript
import { RemoteAgent } from "@fifthrevision/axle";

declare const remoteAgent: RemoteAgent;

remoteAgent.connection; // connecting → open → ended | error
remoteAgent.status; // the served agent's own idle/busy — idle until the stream opens
remoteAgent.onConnection((connection) => console.log(connection.phase));
```

`connection` is the link: `connecting` until the stream opens, `open` while it
runs, then `ended` or `error`. `status` is the served agent: what the stream
opened with, then moved by `operation:start` and `agent:idle` — and already
reading the new value whenever `on` or `onConnection` fires, so snapshotting
it from both misses no change. A remote `onToolCall` handler receives the call
and no `ToolContext`: no `emit` for progress, no `signal` — cancellation is
visible from the events.

## Resuming after a drop

Every event carries a cursor, and every turn folded from one keeps it as
`turn.cursor`. Pass the last one back when you reconnect and the store fills
the gap:

```typescript
const resume = new RemoteAgent(
  httpTransport(url, { after: transcript.turns.at(-1)?.cursor }),
);
```

A dropped stream reopens with the last delivered cursor, so a reconnect sees
exactly what it missed. A `404` or `410` ends the agent instead — there is no
agent at that URL anymore, and every open `final` rejects. `close()` ends it
deliberately.

## Next

- [Remote agents reference](/reference/remote) — every method, transport, and wire type
- [Turns & Transcripts](/concepts/transcripts) — folding the stream you receive
- [Sessions & persistence](/concepts/sessions) — saving the session alongside the turns
