---
title: Annotations & evals
description: Attaching your own UI to a turn — eval scores, sandbox status, anything Axle has no concept of.
---

# Annotations & evals

Annotations are the extension point in a transcript. Parts are Axle's vocabulary;
annotations are yours. If you want something rendered next to a turn that isn't
text, thinking, or a tool call — an eval score, a sandbox booting, a deploy
status — this is the mechanism.

The running example here is an eval pipeline: after each agent turn, score the
output on a few dimensions and show the results inline. It's the pattern
[Sunnyday](https://www.sunnyday.run) uses in production.

## The shape

```typescript
import type { Annotation } from "@fifthrevision/axle/ui";

type EvalAnnotation = Annotation<
  { score: "pass" | "fail"; rationale: string },
  "objectives_eval"
>;

type SandboxAnnotation = Annotation<{ image: string }, "sandbox">;

type AppAnnotation = EvalAnnotation | SandboxAnnotation;
```

Parameterize the transcript with your union and it flows everywhere:

```typescript
import { Transcript } from "@fifthrevision/axle/ui";
import type { TurnEvent } from "@fifthrevision/axle/ui";

const transcript = new Transcript<AppAnnotation>();

// However your app publishes events — a channel, a socket, a local callback.
declare function emit(event: TurnEvent<AppAnnotation>): void;
```

Now `turn.annotations` is `AppAnnotation[]`, and a `switch` on `kind` in your
renderer is exhaustive and type-checked.

## Wrapping async work

Most annotations are asynchronous — you kick off an eval, it takes a few seconds,
then you have a score. That maps onto the annotation lifecycle directly: emit a
`running` annotation, do the work, then replace it with a settled one under the
same `id`.

This helper is worth writing once:

```typescript
import type { TurnEvent } from "@fifthrevision/axle/ui";

async function withTurnAnnotation<T>(
  emit: (event: TurnEvent<AppAnnotation>) => void,
  turnId: string,
  opts: {
    kind: AppAnnotation["kind"];
    label: string;
    placement?: "before" | "after";
    labelDone?: (result: T) => string;
  },
  run: () => Promise<T>,
): Promise<T | null> {
  const id = crypto.randomUUID();
  const base = { id, kind: opts.kind, placement: opts.placement ?? "after" };

  emit({
    type: "annotation:start",
    target: { type: "turn", turnId },
    annotation: { ...base, label: `${opts.label}…`, status: "running" },
  } as TurnEvent<AppAnnotation>);

  try {
    const result = await run();
    emit({
      type: "annotation:end",
      target: { type: "turn", turnId },
      annotation: {
        ...base,
        label: opts.labelDone?.(result) ?? `${opts.label}: done`,
        status: "complete",
        data: result,
      },
    } as TurnEvent<AppAnnotation>);
    return result;
  } catch (error) {
    emit({
      type: "annotation:end",
      target: { type: "turn", turnId },
      annotation: { ...base, label: `${opts.label}: error`, status: "error" },
    } as TurnEvent<AppAnnotation>);
    return null;
  }
}
```

Three things it gets right, and they're the ones easy to miss:

- **The same `id` throughout.** That's what makes `annotation:end` replace the
  running annotation instead of appending a second one.
- **The label changes.** `"Evaluating objectives…"` while running becomes
  `"Objectives: pass"` when it settles. The label is the UI, so compute the final
  one from the result.
- **Failures still settle.** An eval that throws emits an `error` annotation
  rather than leaving a spinner running forever. Swallowing the error and
  returning `null` keeps a failed eval from taking down the turn.

## Running it after a turn

```typescript
declare function evaluateObjectives(
  turn: Turn<AppAnnotation>,
): Promise<{ score: "pass" | "fail"; rationale: string }>;

const result = await agent.send(userInput).final;
if (!result.ok) return;

const turnId = result.turn.id;

const objectives = await withTurnAnnotation(
  emit,
  turnId,
  {
    kind: "objectives_eval",
    label: "Evaluating objectives",
    labelDone: (r) => `Objectives: ${r.score}`,
  },
  () => evaluateObjectives(result.turn),
);
```

`result.turn.id` is the anchor — that's how the annotation finds its turn.

Evals run *after* the send settles, out of band from the agent. They're not tools
and not part of the loop, which is exactly why they need somewhere to live that
isn't the conversation.

For an instant, informational annotation with no async work, emit a single
`annotation:start` that's already `complete`:

```typescript
emit({
  type: "annotation:start",
  target: { type: "turn", turnId },
  annotation: {
    id: crypto.randomUUID(),
    kind: "objectives_eval",
    label: "No deliverables to evaluate",
    placement: "after",
    status: "complete",
  },
} as TurnEvent<AppAnnotation>);
```

## Rendering

Because `label` is required, one generic component handles every kind — including
kinds added later:

```tsx
function AnnotationView({ annotation }: { annotation: AppAnnotation }) {
  const body = annotation.data != null ? JSON.stringify(annotation.data, null, 2) : null;

  return (
    <details>
      <summary
        data-status={annotation.status}
        className={annotation.status === "running" ? "shimmer" : undefined}
      >
        {annotation.label}
      </summary>
      {body ? <pre>{body}</pre> : null}
    </details>
  );
}
```

That's a complete, useful renderer: label, a shimmer while running, an error
state, and the payload on demand. Specialize individual kinds later, when one
earns a real component.

Placement is yours to honour:

```tsx
function AgentTurnView({ turn }: { turn: Turn<AppAnnotation> }) {
  const annotations = turn.annotations ?? [];
  const before = annotations.filter((a) => a.placement !== "after");
  const after = annotations.filter((a) => a.placement === "after");

  return (
    <div>
      {before.map((a) => <AnnotationView key={a.id} annotation={a} />)}
      {turn.parts.map((part) => <PartView key={part.id} part={part} />)}
      {after.map((a) => <AnnotationView key={a.id} annotation={a} />)}
    </div>
  );
}
```

`placement` defaults to `"after"` when accumulated, so evals naturally land below
the turn they scored.

## Annotating a part instead of a turn

The target can be narrower — point at one part instead of the whole turn:

```typescript
declare const partId: string;

emit({
  type: "annotation:start",
  target: { type: "part", turnId, partId },
  annotation: {
    id: crypto.randomUUID(),
    kind: "sandbox",
    label: "Touched a protected path",
    status: "complete",
  },
} as TurnEvent<AppAnnotation>);
```

Useful for flagging one specific tool call — a sandbox command that touched
something sensitive, say — rather than the whole turn.

## Feeding results back to the model

Annotations are display-only, so if a failed eval should change what the agent
does next, that's a separate, deliberate step: send the feedback as a message.

```typescript
if (objectives?.score === "fail") {
  await agent.send(
    `<system>Quality checks failed:\n${objectives.rationale}\nPlease address this and try again.</system>`,
  ).final;
}
```

The separation is the point. The annotation is what your user sees; the message
is what the model sees. Keeping them apart means you can show a rich eval panel
without inflating the context window, and retry with a terse instruction without
that instruction cluttering the UI.

## Across a network boundary

Annotation events are plain JSON like every other `TurnEvent`, so evals can run
on your server and render on a client with no extra plumbing:

```typescript
// server — evals run here, next to your database
const event: TurnEvent<AppAnnotation> = {
  type: "annotation:end",
  target: { type: "turn", turnId },
  annotation: {
    id,
    kind: "objectives_eval",
    label: "Objectives: pass",
    status: "complete",
    data: { score: "pass", rationale: "All deliverables met." },
  },
};
socket.send(JSON.stringify(event));

// client — same transcript that folds the agent's own events
transcript.apply(JSON.parse(payload) as TurnEvent<AppAnnotation>);
```

If your transport also carries application events, `apply()` returns
`handled: false` for anything it doesn't recognize — see
[Transcripts](/concepts/transcripts#mixing-in-your-own-events).

## See also

- [Turns & Transcripts](/concepts/transcripts#annotations-the-extension-point)
- [Streaming to a UI](/cookbook/streaming-ui)
- [Transcript & turn events reference](/reference/transcript#annotations)
