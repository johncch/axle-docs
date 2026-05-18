---
title: Hosting & Sessions
description: Where Axle stops and your host application begins.
---

# Hosting & Sessions

Axle stops at the agent runtime boundary. If you need long-lived sessions,
SSE transport, resumable cursors, or React client hooks, build those
concerns in your host application on top of:

- `Agent` and `agent.on(...)`
- The streamed turn events Axle emits (see [Streaming](/guide/streaming))
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
