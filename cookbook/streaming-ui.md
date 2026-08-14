---
title: Streaming to a UI
description: Fold turn events into a transcript, render it, and persist it.
---

# Streaming to a UI

The integration itself is three lines. Everything else on this page is about
what you do once you have it.

```typescript
import { Agent, Transcript } from "@fifthrevision/axle";

const transcript = new Transcript();
agent.on((event) => transcript.apply(event));

await agent.send(userInput).final;
// transcript.turns is now ready to render
```

`Transcript` handles all the render bookkeeping — opening parts, applying
deltas, settling statuses — so your UI only ever has to draw `turns`.

## Driving a React view

```typescript
const [turns, setTurns] = useState<readonly Turn[]>([]);

useEffect(() => {
  const transcript = new Transcript();
  return agent.on((event) => {
    transcript.apply(event);
    setTurns([...transcript.turns]);
  });
}, [agent]);
```

`agent.on()` returns an unsubscribe function, which means returning it from
`useEffect` is your entire cleanup.

Do copy the array before setting state. `turns` is a stable readonly reference,
so React won't re-render if you hand it the same one — a subtle bug that looks
like "streaming doesn't work."

If the stream is busy, throttle: apply every event, but batch the state update to
an animation frame.

## Rendering a turn

```tsx
function TurnView({ turn }: { turn: Turn }) {
  return (
    <div data-owner={turn.owner} data-status={turn.status}>
      {turn.parts.map((part) => {
        switch (part.type) {
          case "text":
            return <Markdown key={part.id} text={part.text} citations={part.citations} />;
          case "thinking":
            return <Thinking key={part.id} text={part.text} summary={part.summary} />;
          case "file":
            return <FileChip key={part.id} file={part.file} />;
          case "citation":
            return <SourceList key={part.id} citations={part.citations} />;
          case "compaction":
            return <Divider key={part.id} label={part.summary} />;
          case "action":
            return <ActionView key={part.id} part={part} />;
        }
      })}
    </div>
  );
}
```

Part ids stay stable for the life of the turn, which is exactly what makes them
correct React keys.

## Rendering an action

Actions move through several states, and each one wants slightly different UI:

```tsx
function ActionView({ part }: { part: ActionPart }) {
  if (part.kind === "agent") {
    // Recursive — a subagent's turns render with the same component
    return (
      <details>
        <summary>{part.detail.name} ({part.status})</summary>
        {part.detail.children.map((t) => <TurnView key={t.id} turn={t} />)}
      </details>
    );
  }

  const args =
    part.kind === "tool" && part.status === "pending"
      ? part.detail.pendingArgs // still-incomplete JSON
      : JSON.stringify(part.kind === "tool" ? part.detail.parameters : part.detail.input);

  return (
    <div>
      <Spinner active={part.status === "running"} />
      <code>{part.detail.name}({args})</code>
      {part.detail.result?.type === "error" && <Error msg={part.detail.result.error.message} />}
    </div>
  );
}
```

`pendingArgs` exists precisely for that window where arguments are still
streaming in and can't be parsed yet — so you have something to show instead of
an empty box.

## Keeping the UI out of provider SDKs

Your render code probably shouldn't drag the Anthropic, OpenAI, and Google SDKs
into a browser bundle. Import from the `/ui` subpath instead:

```typescript
import { Transcript } from "@fifthrevision/axle/ui";
import type { Turn, TurnPart, ActionPart, TurnEvent } from "@fifthrevision/axle/ui";
```

## Streaming across a network boundary

`TurnEvent` is plain JSON. Serialize it on the server, apply it on the client:

```typescript
// server
agent.on((event) => socket.send(JSON.stringify(event)));

// client
const transcript = new Transcript();
socket.onmessage = (msg) => {
  transcript.apply(JSON.parse(msg.data));
  render(transcript.turns);
};
```

If your socket also carries application events, `apply()` tells you what it did
not recognize:

```typescript
const outcome = transcript.apply(incoming);
if (!outcome.handled) myReducer(outcome.event);
```

## Persisting and restoring

Two things to save, not one — this is the step people miss:

```typescript
await db.save(sessionId, {
  session: await agent.snapshot(), // for the model
  turns: transcript.turns, // for the reader
});

// later
const saved = await db.load(sessionId);
const agent = new Agent(config, saved.session);
const transcript = new Transcript(saved.turns);
agent.on((event) => transcript.apply(event));
```

Save only the session and you get an agent that remembers the conversation
perfectly, next to a UI with nothing to show.

## Annotations

Want to attach UI state — a sandbox booting, an eval result — to a turn without
it becoming model state? Emit annotation events into the same transcript:

```typescript
transcript.apply({
  type: "annotation:start",
  target: { type: "turn", turnId },
  annotation: { id, kind: "sandbox", label: "Starting sandbox…", status: "running" },
});
```

They live on `turn.annotations` and `part.annotations`, and never reach a
provider — which is the whole point of having them.

Annotations are the main extension point in a transcript, and there's more to
them than one event: lifecycles, typed unions, and a generic renderer that
handles kinds you haven't written yet. See
[Annotations & evals](/cookbook/annotations).

## See also

- [Turn events](/concepts/turn-events)
- [Turns & Transcripts](/concepts/transcripts)
- [Transcript & turn events reference](/reference/transcript)
