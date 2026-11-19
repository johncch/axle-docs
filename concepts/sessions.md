---
title: Sessions & persistence
description: Saving a conversation, bringing it back, and what's deliberately left out.
---

# Sessions & persistence

A **session** is the continuable identity of a conversation. Its serialized form
is deliberately small:

```typescript
interface AgentSession {
  sessionId: string;
  messages: AxleMessage[];
}
```

That's the pure continuation — a session id and the active model-facing
conversation. Nothing else.

## Snapshot and restore

Save it when you're done:

```typescript
const session = agent.session;
await db.save(session.sessionId, session);
```

Then pick it up later, in another process:

```typescript
const session = await db.load(sessionId);
const agent = new Agent(config, session);
```

`agent.session` returns that same `{ sessionId, messages }` synchronously, as
it stands — safe inside `onStep`, `onStart`, `onSettled`, continuations, and
tools, where `snapshot()` would deadlock. To save a state at rest, read it in
an `onSettled` or `onIdle` callback, or after awaiting the send's `final`.

`snapshot()` is deprecated but still works: it is async, and it resolves when the agent goes idle — at once when
nothing is running, otherwise when the last queued operation has settled. That's
what guarantees you're capturing a conversation at rest: a snapshot never
contains a streaming or half-executed turn, and it includes everything queued
before the agent went idle. It is not queued work itself — it doesn't make the
agent busy, fires no `onIdle`, and `clear()` doesn't cancel it.

::: danger Don't await snapshot() from inside a send or an onSettled callback
It needs the agent to go idle, so calling it from a tool's `execute`, an
`onToolCall` handler, a compaction callback, an `onStep` callback, or an `onSettled` callback will
deadlock. Call it from outside a send — or read `agent.session` instead.
:::

To save after each operation without awaiting the queue empty, use `onSettled`
instead — it hands you the same session plus exactly what the handle settled
with, before the handle settles:

```typescript
agent.onSettled(async (session, operation) => {
  await db.save(session.sessionId, { session, turns: transcript.turns });
});
```

If you supply both `config.sessionId` and `session.sessionId`, the restored one
wins. Unknown keys from older Axle versions get ignored, so an old stored session
still loads fine.

## What a session leaves out, and why

Not included: providers, tools, MCP clients, file resolvers, tracers — anything
executable. And not the transcript.

Runtime objects are excluded because they're process-local and frequently carry
secrets. You rebuild them from your own configuration:

```typescript
const config = {
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-sonnet-4-5",
  tools: [getWeather],
};

const agent = new Agent(config, session);
```

The transcript is excluded because it's [yours](/concepts/transcripts). So
persist both:

```typescript
await db.save(id, {
  session: agent.session,
  turns: transcript.turns,
});
```

And restore both:

```typescript
const saved = await db.load(id);
const agent = new Agent(config, saved.session);
const transcript = new Transcript(saved.turns);
agent.on((event) => transcript.apply(event));
```

Persist `turns` only — `transcript.pending` is live state (queued sends and
compactions the agent accepted but hasn't started) and is never saved. After a
restore there is no pending, and nothing recorded a save for.

Worth saying plainly: if you save only the session, you get an agent that
remembers the conversation perfectly and a UI with nothing to show. It's an easy
mistake to make once.

## Storing agent recipes

If your application lets users *configure* agents rather than hardcoding them,
keep the recipe in your own shape — a path, a name, the parsed recipe file —
and rebuild `AgentConfig` from it directly. Core carries no serializable agent
recipe (`AgentDefinition`, `createAgentConfig()`, and friends were removed in
0.35.0): the definition mirrored `AgentConfig` field for field, and every host
resolved providers, tools, MCPs, and skills from its own configuration anyway.

```typescript
// your shape, your store
const saved = await db.loadAgent(id); // { recipe, session }

declare const providers: Record<string, import("@fifthrevision/axle").AIProvider>;
declare const tools: Record<string, import("@fifthrevision/axle").ExecutableTool>;

const agent = new Agent(
  {
    provider: providers[saved.recipe.provider],
    model: saved.recipe.model,
    system: saved.recipe.system,
    tools: saved.recipe.tools?.map((name) => tools[name]),
  },
  saved.session,
);
```

Harness concerns like file resolvers, tracing, transport, and stores stay
outside the recipe on purpose. Keep those in your own configuration.

## Long conversations

A session grows without bound until you do something about it. That something is
[compaction](/concepts/compaction) — and since it rewrites `agent.messages`, any
snapshot you take afterwards is correspondingly smaller.

## Next

- [Compaction](/concepts/compaction)
- [Turns & Transcripts](/concepts/transcripts)
- [Agent reference](/reference/agent)
