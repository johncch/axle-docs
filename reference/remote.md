---
title: Remote agents
description: RemoteAgent, its transports, the served side's event store, and the wire types.
---

# Remote agents

::: warning Experimental
Remote agents are under active design and may change in any release.
:::

Conceptual guide: [Remote agents](/concepts/remote-agents).

## RemoteAgent

```typescript
import { RemoteAgent, type AgentTransport } from "@fifthrevision/axle";

declare const transport: AgentTransport;

const client = new RemoteAgent(transport);
```

Drives an agent served elsewhere. Holds no transcript — it folds each turn only
long enough to hand back `turn` and `response` on the send's result, as `Agent`
does.

| Member | Type | Notes |
| --- | --- | --- |
| `on(callback)` | `(event: StoredEvent<THostEvent>) => void` → unsubscribe | Every event on the served side's stream, in order: the agent's events and the host's, each with its cursor. |
| `onConnection(callback)` | `(connection: RemoteConnection) => void` → unsubscribe | The link's state. |
| `onToolCall(handler)` | `ToolCallCallback` → unsubscribe | Answers the served agent's deferred calls from here. Receives the call and no `ToolContext`: no `emit`, no `signal`. |
| `toolCall(id)` | `(id: string) => RemoteWaitingToolCall \| undefined` | The deferred call this consumer has seen waiting and not yet seen settle. |
| `send(message, options?)` / `send(instruct, options?)` | → `RemoteHandle<T>` | Like `Agent.send`, minus `after`: a plain prompt sends as-is, an `Instruct` is rendered and the schema parses `response`. Returns `{ final }` only — no `cancel`, since a queued remote send cannot be cancelled by id. `final` settles when the served operation ends, after its continuation and `onSettled`: `complete` resolves with the result, `cancelled` rejects with `AxleAgentAbortError`, `error` rejects with an `AxleError` carrying the message. |
| `cancel()` / `stop()` / `clear()` | `() => Promise<boolean>` | The `Agent` meanings — the active turn now, the active turn at its batch boundary, the queue — each posted as one command. |
| `close()` | `() => void` | Stops listening. Open sends reject; the served agent is untouched. |
| `connection` | `RemoteConnection` | `connecting` until the stream opens, `open` while it runs, then `ended` or `error`. |
| `status` | `AgentStatus` | The served agent's status: the stream's opening status, then moved by `operation:start` (busy with its id) and `agent:idle` — already updated when `on` delivers the event that moved it. `idle` until the stream opens. |

```typescript
type RemoteConnection =
  | { phase: "connecting" }
  | { phase: "open" }
  | { phase: "ended" }
  | { phase: "error"; error: Error };
```

```typescript
interface RemoteSendOptions {
  id?: string; // the user turn's id, as SendMessageOptions.id — generated when omitted
  metadata?: MessageMetadata;
}

interface RemoteHandle<T> {
  readonly final: Promise<AgentResult<T> | AgentErrorResult>;
}

interface RemoteWaitingToolCall {
  answer(content: string | ToolResultPart[]): Promise<CommandOutcome>;
  fail(message: string): Promise<CommandOutcome>;
}
```

Two gaps against `Agent`, both from what cannot cross: a remote result carries
no `after` list, and an `error` outcome crosses as its message. A remote
`onToolCall` handler's signal is not the served run's — cancellation is visible
from the events.

## Transports

```typescript
import { httpTransport, loopbackTransport } from "@fifthrevision/axle";
```

`httpTransport` speaks to one URL: `GET` opens the event stream as
Server-Sent Events, `POST` sends a command as JSON and reads the outcome back.
A dropped stream reopens with `Last-Event-ID` set to the last cursor
delivered; reconnecting retries a network failure or a `5xx` after
`reconnectDelayMs`, doubling to `maxReconnectDelayMs`, with no cap on attempts.
A `404` or `410` ends the agent — there is no agent at that URL, and every
open `final` rejects. Any other failed response fails the connection. The
first connection does not retry.

`loopbackTransport` is the same contract with no wire: the store's events
straight out, each command straight to the handler. For tests, and for a hop
that serves an agent in its own process.

```typescript
function httpTransport<THostEvent extends { type: string } = never>(
  url: string | URL,
  options?: HttpTransportOptions,
): AgentTransport<THostEvent>;

interface HttpTransportOptions {
  after?: string; // cursor to resume from on the first connection, e.g. a stored Turn.cursor
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>); // sent with every request
  reconnectDelayMs?: number; // default 1000 — wait before the first reconnect
  maxReconnectDelayMs?: number; // default 30000 — ceiling on the doubling wait
  fetch?: typeof fetch;
}

class HttpTransportError extends Error {
  readonly status: number;
}

function loopbackTransport<THostEvent extends { type: string } = never>(
  store: InMemoryEventStore<THostEvent>,
  handle: (command: AgentCommand) => Promise<CommandOutcome>,
): AgentTransport<THostEvent>;
```

## The served side

```typescript
import { InMemoryEventStore, toEventStreamResponse, parseAgentCommand } from "@fifthrevision/axle";
```

`InMemoryEventStore` keeps one served agent's events — every agent event, and
every host event given to `push` — stamped with a cursor `<id>-<seq>` in the
order it happened. It keeps the agent's status too, folded from its own log.
`subscribe(signal, after?)` opens with that status, replays what the consumer
has not seen (every event when the store does not own the cursor), and
continues live. `close()` stops listening to the agent and ends every open
subscription once it has delivered what it holds; a later `subscribe` replays
and ends, and a later `push` is dropped.

```typescript
class InMemoryEventStore<THostEvent extends { type: string } = never> {
  constructor(agent: Agent | RemoteAgent<THostEvent>); // any served agent — a hop consumes upstream and serves downstream
  get lastCursor(): string; // cursor of the last event; "<id>-0" before the first
  owns(cursor: string | null | undefined): boolean; // whether a cursor names a position in this store
  push(event: THostEvent): void; // a host event, stamped in sequence with the agent's
  subscribe(signal: AbortSignal, after?: string | null): AgentSubscription<THostEvent>;
  close(): void;
}
```

`toEventStreamResponse(subscription, request?)` answers an HTTP request with a
subscription as Server-Sent Events: the welcome first as `event: welcome` with
no `id`, then each event as JSON in `data:` with its cursor in `id:`. Ends the
items when the request aborts or the body is cancelled.

`parseAgentCommand(body)` reads a `POST` body against the spec and returns the
typed command, or `null` for anything it does not describe.

```typescript
function toEventStreamResponse<THostEvent extends { type: string }>(
  subscription: AgentSubscription<THostEvent>,
  request?: Request,
): Response;

function parseAgentCommand(body: unknown): AgentCommand | null;
```

## Wire types

```typescript
type AgentCommand =
  | { type: "send"; id: string; prompt: string; files?: FileInfo[]; metadata?: Record<string, unknown> }
  | { type: "answer"; callId: string; content: string | ToolResultPart[] }
  | { type: "fail"; callId: string; message: string }
  | { type: "cancel" }
  | { type: "stop" }
  | { type: "clear" };

type CommandOutcome =
  | { accepted: true }
  | { accepted: false; reason: { type: "not-waiting" | "idle"; message: string } };
```

```typescript
type StoredEvent<THostEvent extends { type: string } = never> = (TurnEvent | THostEvent) & {
  cursor: string;
};

interface AgentWelcome {
  type: "welcome";
  status: AgentStatus; // the served agent's status as the stream opened
}

type StreamItem<THostEvent extends { type: string } = never> =
  StoredEvent<THostEvent> | AgentWelcome;

interface AgentSubscription<THostEvent extends { type: string } = never> {
  welcome: AgentWelcome;
  items: AsyncIterable<StreamItem<THostEvent>>;
}

interface AgentTransport<THostEvent extends { type: string } = never> {
  events(signal: AbortSignal): Promise<AgentSubscription<THostEvent> | undefined>;
  command(command: AgentCommand, signal?: AbortSignal): Promise<CommandOutcome>;
}
```

The cursor's format is the store's — transports and `Turn.cursor` treat it as
an opaque string. A `StreamItem` narrows to its welcome on
`item.type === "welcome"`; the shipped transports do that for you, so only a
transport of your own needs it.
