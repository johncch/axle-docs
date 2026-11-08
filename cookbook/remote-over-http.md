---
title: Remote agents over HTTP
description: Two routes on the server, one RemoteAgent on the client, and what to do when the stream drops.
---

# Remote agents over HTTP

[Remote agents](/concepts/remote-agents) explains the pieces and shows the whole
thing over `loopbackTransport`, in one process. This is the HTTP version: two
routes on the server, a client that folds the stream, and the reconnect that
makes a dropped Wi-Fi connection a non-event.

::: warning Experimental
Remote agents are under active design and may change in any release.
:::

The shape to keep in mind: **commands go in over `POST`, everything else comes
back out over one `GET` stream.** The client never asks for state — it reads the
events.

## One agent, two routes

The server owns the agents: it builds them from the provider key and the tools
whose `execute` only works there, and keeps an `InMemoryEventStore` beside each
one.

```typescript
import { Agent, InMemoryEventStore, toEventStreamResponse, parseAgentCommand } from "@fifthrevision/axle";

type Served = { agent: Agent; store: InMemoryEventStore };

const live = new Map<string, Served>();
const ended = new Set<string>();

function serve(sessionId: string): Served {
  const agent = new Agent({ provider, model, tools: [askUser] });
  const served = { agent, store: new InMemoryEventStore(agent) };
  live.set(sessionId, served);
  return served;
}
```

Both routes sit on the same URL — that's what `httpTransport` expects — and
differ only by method:

```typescript
async function handle(request: Request, sessionId: string): Promise<Response> {
  if (ended.has(sessionId)) return new Response("Agent ended", { status: 410 });
  const served = live.get(sessionId);
  if (!served) return new Response("No such agent", { status: 404 });

  if (request.method === "GET") {
    const after = request.headers.get("last-event-id");
    const subscription = served.store.subscribe(request.signal, after);
    return toEventStreamResponse(subscription, request);
  }

  if (request.method === "POST") {
    const command = parseAgentCommand(await request.json());
    if (!command) return new Response("Unrecognized command", { status: 400 });
    const outcome = await runCommand(served.agent, command);
    return new Response(JSON.stringify(outcome), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
}
```

Three things in there are load-bearing:

- **`last-event-id` is the resume cursor.** The client sets that header — on its
  first connection when you gave `httpTransport` an `after`, and on every
  reconnect with the last cursor it actually received. Pass it straight to
  `subscribe`, which replays what the consumer missed and then goes live.
  `request.headers.get()` returns `string | null`, which is exactly what
  `subscribe` takes.
- **`request.signal` ends the subscription** when the client disconnects, so a
  closed tab doesn't leave a subscriber behind.
- **`404` and `410` are terminal.** The client stops and rejects every open
  `final` on either, rather than retrying. Anything `5xx` it *will* retry, which
  is what you want mid-deploy — so don't answer a dead agent with a `500`.

## The command switch

`parseAgentCommand` hands you a typed `AgentCommand`; turning it into `Agent`
calls is yours, because only the server knows how to find the agent:

```typescript
import type { AgentCommand, CommandOutcome } from "@fifthrevision/axle";

const accepted: CommandOutcome = { accepted: true };
const notWaiting = (callId: string): CommandOutcome => ({
  accepted: false,
  reason: { type: "not-waiting", message: `No waiting call ${callId}` },
});

async function runCommand(agent: Agent, command: AgentCommand): Promise<CommandOutcome> {
  switch (command.type) {
    case "send": {
      const handle = agent.send(command.prompt, { id: command.id });
      handle.final.catch(() => {}); // the result reaches the client as events
      return accepted;
    }
    case "answer": {
      const call = agent.toolCall(command.callId);
      if (!call) return notWaiting(command.callId);
      await call.answer(command.content);
      return accepted;
    }
    case "fail": {
      const call = agent.toolCall(command.callId);
      if (!call) return notWaiting(command.callId);
      await call.fail(command.message);
      return accepted;
    }
    case "cancel":
    case "stop": {
      const took = command.type === "cancel" ? agent.cancel() : agent.stop();
      return took
        ? accepted
        : { accepted: false, reason: { type: "idle", message: "No active turn" } };
    }
    case "clear":
      agent.clear();
      return accepted;
  }
}
```

Note the `handle.final.catch(() => {})`. The response to a `send` says only
whether the agent took it; the turn, the answer and any failure travel as
events. Without that `catch`, a send that fails takes down the process with an
unhandled rejection — the client is reading the outcome, nobody is awaiting the
handle.

## The client

```typescript
import { RemoteAgent, Transcript, httpTransport, isCall } from "@fifthrevision/axle";

declare function setOffline(offline: boolean): void;

const remoteAgent = new RemoteAgent(httpTransport(`/agents/${sessionId}`));
const transcript = new Transcript();

remoteAgent.on((event) => transcript.apply(event));
remoteAgent.onConnection((connection) => setOffline(connection.phase !== "open"));

remoteAgent.onToolCall((call) => {
  if (!isCall(askUser, call)) return;
  return prompt(call.input.question);
});

const result = await remoteAgent.send("Summarize today's incidents.").final;
```

That is the same code you'd write against a local `Agent`, with three
differences worth planning for:

- **A remote send's handle has `final` and nothing else.** There is no
  `handle.cancel()`, because a queued send can't be cancelled by id across a
  wire. Use `remoteAgent.cancel()`, `stop()` or `clear()` — each posts one
  command and resolves `true` when the served agent took it, `false` when the
  switch answered `accepted: false` (nothing running, in the case of a cancel).
- **A remote `onToolCall` handler gets no `ToolContext`.** No `emit` for
  progress, no `signal`; cancellation shows up in the events instead.
- **The agent's work is not your connection.** `remoteAgent.status` is the
  served agent's idle/busy; `remoteAgent.connection` is the link. A spinner
  driven by the wrong one lies to the user — see [Status and connection are
  separate](/concepts/remote-agents#status-and-connection-are-separate).

## Resuming after a drop

Every event carries a cursor and every turn keeps the one it was folded from,
so the thing you persist for resume is already in your transcript:

```typescript
const resumed = new RemoteAgent(
  httpTransport(`/agents/${sessionId}`, { after: saved.turns.at(-1)?.cursor }),
);
```

Reconnects inside a live `RemoteAgent` need nothing from you: the transport
reopens with the last cursor it delivered, waiting `reconnectDelayMs` and
doubling up to `maxReconnectDelayMs`, for as long as it takes. `after` is for
the *first* connection — a reload, a second device, a client that was away long
enough to be restarted.

A cursor the store doesn't recognize replays everything rather than nothing,
which is the safe direction: a client that resumes against a restarted server
rebuilds its transcript instead of silently missing the middle.

## Ending an agent

The server decides when an agent is over. Close the store so open streams
finish what they hold, then answer that URL with `410`:

```typescript
function end(sessionId: string): void {
  const served = live.get(sessionId);
  served?.store.close();
  live.delete(sessionId);
  ended.add(sessionId);
}
```

On the client that ends the `RemoteAgent`: the connection goes to `ended` and
every open `final` rejects. `remoteAgent.close()` is the same ending chosen from
the other side — it stops listening and leaves the served agent alone.

## Auth

`headers` is sent with every request, and a function is called per request, so a
token that expires mid-stream is a one-liner:

```typescript
declare function freshToken(): Promise<string>;

const authed = httpTransport(url, {
  headers: async () => ({ authorization: `Bearer ${await freshToken()}` }),
});
```

Each reconnect calls it again, which is what makes a long-lived stream survive
a rotation.

## Keeping the browser bundle clean

Import the client half from `@fifthrevision/axle/ui`:

```typescript
import { RemoteAgent, Transcript, httpTransport, isCall } from "@fifthrevision/axle/ui";
```

`RemoteAgent`, `httpTransport`, `Transcript` and the narrowing helpers all live
there, and that entry point depends only on `chalk`, `marked` and `zod` — no
provider SDKs. The browser never had the key anyway; now it doesn't have the
SDKs either.

## See also

- [Remote agents](/concepts/remote-agents) — the pieces, and the loopback version
- [Remote agents reference](/reference/remote) — every method, transport and wire type
- [Streaming to a UI](/cookbook/streaming-ui) — rendering the stream you receive
- [Tools](/concepts/tools#deferred-tools) — the deferred calls a client answers
