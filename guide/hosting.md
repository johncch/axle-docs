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
  carried on `step:complete` and `tool-results:complete` — useful as
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

## Agent definitions and sessions

0.20.0 introduces serializable types for save/resume workflows:

- **`AgentDefinition`** — a serializable recipe. It describes the provider,
  model, system prompt, tools, and request defaults in a form safe to store in
  a database or send over the wire. It is deliberately not executable by
  itself; the host resolves providers and tools into a runtime `AgentConfig`.
- **`AgentSession`** — continuation state. It holds the
  model-facing `messages` and the stable `sessionId`. Unknown keys in
  sessions stored by older Axle versions are silently ignored. Turns are
  host-owned — attach a `Transcript` to the event stream and persist its
  `turns` alongside the session.
- **`SavedAgent`** — the pair of `{ definition, session }` suitable for
  persistence.

### Saving an agent

```typescript
import type { SavedAgent, AgentDefinition } from "@fifthrevision/axle";
import { Transcript } from "@fifthrevision/axle";

// Your serializable definition — store this in your DB
const definition: AgentDefinition = {
  version: 1,
  name: "my-agent",
  provider: { type: "anthropic" },
  model: "claude-sonnet-4-5-20250929",
  system: "You are a helpful assistant.",
};

const agent = new Agent(await createAgentConfig(definition, myResolver));

// Attach a transcript to the event stream
const transcript = new Transcript();
agent.on((event) => transcript.apply(event));

await agent.send("Hello").final;

// Snapshot the current session and persist alongside turns
const saved: SavedAgent = {
  definition,
  session: await agent.snapshot(),
};
await db.saveAgent(userId, saved, transcript.turns);
```

### Restoring an agent

```typescript
import { Agent, createAgentConfig, Transcript } from "@fifthrevision/axle";

const { saved, turns } = await db.loadAgent(userId);

// Host resolves the definition into executable dependencies
const config = await createAgentConfig(saved.definition, myResolver);
const agent = new Agent(config, saved.session);

// Re-seed the transcript from persisted turns
const transcript = new Transcript(turns);
agent.on((event) => transcript.apply(event));

// Continue the conversation — messages are fully restored
await agent.send("What did we discuss before?").final;
```

### The resolver pattern

`createAgentConfig(definition, resolver)` separates the serializable recipe
from the runtime wiring. Your resolver receives the `AgentDefinition` and
returns the live objects:

```typescript
import type { AgentDefinitionResolver } from "@fifthrevision/axle";
import { anthropic, openai } from "@fifthrevision/axle";

const myResolver: AgentDefinitionResolver = async (definition) => {
  const providerMap = {
    anthropic: anthropic(process.env.ANTHROPIC_API_KEY!),
    openai: openai(process.env.OPENAI_API_KEY!),
  };

  return {
    provider: providerMap[definition.provider.type],
    // Resolve tool names to ExecutableTool instances, MCP clients, etc.
    tools: resolveTools(definition.tools),
  };
};
```

Harness concerns — memory implementations, file resolvers, tracers, stores —
are layered onto the returned `AgentConfig` by the host after resolution.
