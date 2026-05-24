---
title: Hosting & Sessions
description: Where Axle stops and your host application begins.
---

# Hosting & Sessions

Axle stops at the agent runtime boundary. If you need long-lived sessions,
SSE transport, resumable cursors, or React client hooks, build those
concerns in your host application on top of:

- `Agent` and `agent.on(...)`
- The streamed `TurnEvent`s Axle emits (see [Streaming](/guide/streaming))
- `TurnAccumulator` for materialising turn state from an event stream
- The complete `AxleAssistantMessage` and `AxleToolCallMessage` objects
  carried on `turn:complete` and `tool-results:complete` — useful as
  authoritative message boundaries for client-server architectures.

## Typical host responsibilities

- **Session storage.** Persist message history per user/conversation.
- **Transport.** Wrap Axle's event stream in SSE, WebSockets, or whatever
  your client uses.
- **Reconnection.** Track cursors per session and resume where the client
  left off.
- **Authorization.** Gate which agents/tools each request can use.

Axle deliberately does not opine on these — they are application-specific
and changing them shouldn't require forking the agent core.

## Multiplexing turn events with host events

When your SSE or WebSocket stream carries both Axle `TurnEvent`s and your own
host-level events (`run:terminal`, `session:expired`, etc.), use
`TurnAccumulator` to separate them:

```typescript
import {
  TurnAccumulator,
  type Annotation,
  type TurnEvent,
} from "@fifthrevision/axle";

type AppAnnotation = Annotation<{ score: number; passed: boolean }, "eval">;

type HostEvent =
  | { type: "run:terminal"; status: string }
  | { type: "session:expired" };

const accumulator = new TurnAccumulator<AppAnnotation, HostEvent>();

function applySSEEvent(event: TurnEvent<AppAnnotation> | HostEvent) {
  const result = accumulator.apply(event);

  if (!result.handled) {
    // result.event is typed as HostEvent
    handleHostEvent(result.event);
  }

  setTurns(result.state.turns);
}
```

`TurnAccumulator` knows about all `TurnEvent` variants — anything it does not
recognise is returned with `handled: false` so your host handler can process it.

See [Streaming](/guide/streaming) for the full `TurnEvent` list and annotation
support.
