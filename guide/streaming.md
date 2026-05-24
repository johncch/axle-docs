---
title: Streaming
description: Two event models — Agent.on() (high-level turn parts) and stream().on() (raw provider events).
---

# Streaming

Axle has two streaming event models, used at different levels of the API:

- **`Agent.on(...)`** emits `TurnEvent` — a high-level "turn" view organized
  around parts (text, thinking, action). Use this for app code built on
  `Agent`.
- **`stream(...).on(...)`** emits `StreamEvent` — a lower-level view that
  surfaces every text/thinking/tool transition the provider produces. Use
  this when you call the [low-level `stream()`](/guide/low-level) primitive
  directly.

`Agent` uses `stream()` internally and translates each `StreamEvent` into one
or more `TurnEvent`s via `TurnEventBuilder`, then accumulates them into
`Turn[]` via `TurnAccumulator`.

## Agent events

```typescript
import type { TurnEvent } from "@fifthrevision/axle";

const agent = new Agent({ provider, model });

agent.on((event: TurnEvent) => {
  switch (event.type) {
    case "part:start":
      if (event.part.type === "text") console.log("[text started]");
      if (event.part.type === "thinking") console.log("[thinking started]");
      if (event.part.type === "action") console.log(`[tool] ${event.part.detail.name}`);
      break;
    case "text:delta":
      process.stdout.write(event.delta);
      break;
    case "action:running":
      console.log("[tool running]");
      break;
    case "action:complete":
      console.log("[tool complete]");
      break;
    case "turn:end":
      console.log(`[turn done: ${event.status}]`);
      break;
    case "error":
      console.error(event.error);
      break;
  }
});
```

### Event types

| Event                    | Carries                                                          | Description                                                          |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `session:restore`        | `turns`, `config?`                                               | Replayed when prior turns are restored into the agent.               |
| `turn:user`              | `turn`                                                           | A user turn was appended to history.                                 |
| `turn:start`             | `turnId`                                                         | A new assistant turn began.                                          |
| `turn:end`               | `turnId`, `status`, `usage`, `timing?`                           | The assistant turn finished (`complete`, `cancelled`, `error`).      |
| `part:start`             | `turnId`, `part` (`TurnPart`)                                    | A new part started — discriminate on `part.type`.                    |
| `text:delta`             | `turnId`, `partId`, `delta`                                      | Incremental text chunk inside the current text part.                 |
| `thinking:delta`         | `turnId`, `partId`, `delta`                                      | Incremental reasoning chunk inside a thinking part.                  |
| `part:end`               | `turnId`, `partId`, `timing?`                                    | The current part finished.                                           |
| `action:args-delta`      | `turnId`, `partId`, `delta`, `accumulated`                       | Tool/agent arguments are still streaming in.                         |
| `action:running`         | `turnId`, `partId`, `parameters?`                                | Local tool / sub-agent / provider tool started executing.            |
| `action:progress`        | `turnId`, `partId`, `chunk`                                      | Streamed output from a running action (e.g. `execTool` stdout).      |
| `action:complete`        | `turnId`, `partId`, `result` (`ActionResult`)                    | Action finished — inspect `result.type` for `success` vs `error`.    |
| `action:error`           | `turnId`, `partId`, `error`                                      | Action failed with a typed error.                                    |
| `action:child-event`     | `turnId`, `partId`, `event`                                      | An event from a nested sub-agent run.                                |
| `annotation:update`      | `target`, `annotation`                                           | An annotation was created or updated on a session, turn, or part.    |
| `annotation:end`         | `target`, `annotation`                                           | An annotation was finalised on a session, turn, or part.             |
| `error`                  | `error`                                                          | Top-level error during the run.                                      |

### Part types

`part:start` carries a `TurnPart`, discriminated by `part.type`:

- `"text"` — assistant text. Subsequent `text:delta` events fill it in.
- `"thinking"` — reasoning content. Subsequent `thinking:delta` events fill it in.
- `"file"` — a file attachment the assistant produced (rare).
- `"action"` — a tool, sub-agent, or provider tool call. Distinguish with
  `part.kind`: `"tool" | "agent" | "provider-tool"`.

All part variants (and `Turn` itself) support embedded annotations once the
stream is accumulated. See [Annotations](#annotations) below.

Callbacks are registered once and fire on every subsequent `send()`.

## TurnAccumulator

`TurnAccumulator` materialises a `TurnEvent` stream into `Turn[]`. It is
especially useful in SSE or WebSocket consumers that multiplex Axle turn
events with host-level events (e.g. `run:terminal`, `session:expired`).

```typescript
import {
  TurnAccumulator,
  type Annotation,
  type TurnEvent,
} from "@fifthrevision/axle";

type AppAnnotation =
  | Annotation<{ image: string }, "sandbox">
  | Annotation<{ score: number; passed: boolean }, "eval">;

type HostEvent =
  | { type: "run:terminal"; status: string }
  | { type: "session:expired" };

const accumulator = new TurnAccumulator<AppAnnotation, HostEvent>();

function applyEvent(event: TurnEvent<AppAnnotation> | HostEvent) {
  const result = accumulator.apply(event);

  if (!result.handled) {
    // result.event is a HostEvent — handle it yourself
    applyHostEvent(result.event);
  }

  render(result.state.turns);
}
```

- Known `TurnEvent`s return `handled: true`.
- Unknown host events return `handled: false`; `result.event` is typed as the
  host event union.
- `state.turns` contains the fully accumulated `Turn[]` snapshot.
- `state.sessionAnnotations` contains session-level annotations.

`Agent` uses `TurnAccumulator` internally to derive `history.turns` — so
`agent.history.turns` is already a snapshot, not a mutable object.

## Annotations

`Turn`, `TurnPart`, and every part variant accept embedded annotations.
Annotations are presentation metadata (eval scores, sandbox status, deployment
state, etc.) that render alongside turns without entering model state.

```typescript
import type { Annotation, TurnEvent } from "@fifthrevision/axle";

type AppAnnotation =
  | Annotation<{ image: string }, "sandbox">
  | Annotation<{ score: number; passed: boolean }, "eval">;

const annotation: AppAnnotation = {
  id: crypto.randomUUID(),
  kind: "eval",
  label: "Plan adherence",
  placement: "after",
  status: "complete",
  data: { score: 0.92, passed: true },
};

const event: TurnEvent<AppAnnotation> = {
  type: "annotation:end",
  target: { type: "turn", turnId },
  annotation,
};
```

`label` is required so generic renderers have a common UI surface.

`annotation:end` defaults missing `status` to `"complete"` when accumulated.

`annotation:update` and `annotation:end` carry the full updated annotation — there is no patch or merge.

## stream() events

The low-level [`stream()`](/guide/low-level) primitive exposes a different
event shape — closer to the raw provider stream, with separate `start`/`end`
events for each text and thinking block, and distinct events for tool
request / execution / completion.

```typescript
const handle = stream({ provider, model, messages });

handle.on((event) => {
  switch (event.type) {
    case "text:start":     console.log(`[text ${event.index}]`); break;
    case "text:delta":     process.stdout.write(event.delta); break;
    case "text:end":       console.log("\n[text end]"); break;
    case "tool:request":   console.log(`[tool ${event.name}]`); break;
    case "tool:exec-start":   console.log("[exec start]"); break;
    case "tool:exec-complete":console.log("[exec complete]"); break;
    case "turn:complete":  console.log("[turn complete]"); break;
    case "error":          console.error(event.error); break;
  }
});
```

### Event types

| Event                     | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `text:start`              | A text block began (carries `index`).                                       |
| `text:delta`              | Incremental text chunk.                                                     |
| `text:end`                | Text block ended; carries the final concatenated `final` string.            |
| `thinking:start`          | A reasoning block began.                                                    |
| `thinking:delta`          | Incremental reasoning chunk.                                                |
| `thinking:end`            | Reasoning block ended; carries `final`.                                     |
| `tool:request`            | Model requested a tool call. Arguments may still be streaming.              |
| `tool:exec-start`         | Local tool execution started; carries `parameters`.                         |
| `tool:exec-delta`         | Streamed chunk from a running tool (e.g. `execTool` stdout/stderr).         |
| `tool:exec-complete`      | Local tool execution finished; carries the `result`.                        |
| `provider-tool:start`     | Provider-side tool started (web search, code interp.).                      |
| `provider-tool:complete`  | Provider-side tool finished; may carry `output`.                            |
| `turn:complete`           | Assistant turn finished; carries the full `AxleAssistantMessage`.           |
| `tool-results:start`      | Tool-results message is about to be sent back to the model.                 |
| `tool-results:complete`   | Tool-results message committed; carries the `AxleToolCallMessage`.          |
| `error`                   | Error event during the run.                                                 |

The `turn:complete` and `tool-results:complete` events carry complete
`AxleAssistantMessage` and `AxleToolCallMessage` objects — useful for
client-server architectures that need authoritative message boundaries.

## Cancellation

Both event streams share the same cancellation semantics:

- `handle.cancel(reason)` aborts mid-stream.
- `handle.final` rejects with an `AxleAbortError` that preserves `reason`,
  `usage`, `messages`, `partial`, and (for `Agent.send`) `turn`.

See [Results & Errors](/guide/results) for handling cancellation.
