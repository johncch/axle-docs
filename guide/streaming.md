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
or more `TurnEvent`s.

## Agent events

```typescript
const agent = new Agent({ provider, model });

agent.on((event) => {
  switch (event.type) {
    case "part:start":
      if (event.part.type === "text") console.log("[text started]");
      if (event.part.type === "thinking") console.log("[thinking started]");
      if (event.part.type === "citation") console.log("[citations]");
      if (event.part.type === "action") console.log(`[tool] ${event.part.detail.name}`);
      break;
    case "text:delta":
      process.stdout.write(event.delta);
      break;
    case "text:citation":
      console.log(`[citation] ${event.citation.source.type}`);
      break;
    case "thinking:delta":
      process.stdout.write(event.delta);
      break;
    case "thinking:summary-delta":
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

| Event                    | Carries                                                                      | Description                                                          |
| ------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `session:restore`        | `turns`, `sessionAnnotations?`, `config?`                                    | Replayed when prior turns are restored into the agent.               |
| `turn:user`              | `turn`                                                                       | A user turn was appended to history.                                 |
| `turn:start`             | `turnId`, `timing?`                                                          | A new assistant turn began.                                          |
| `turn:end`               | `turnId`, `status`, `usage`, `timing?`                                       | The assistant turn finished (`complete`, `cancelled`, `error`).      |
| `part:start`             | `turnId`, `part` (`TurnPart`)                                                | A new part started — discriminate on `part.type`.                    |
| `text:delta`             | `turnId`, `partId`, `delta`                                                  | Incremental text chunk inside the current text part.                 |
| `text:citation`          | `turnId`, `partId`, `citation`                                               | A provider citation attached to the current text part.               |
| `thinking:delta`         | `turnId`, `partId`, `delta`                                                  | Incremental reasoning chunk inside a thinking part.                  |
| `thinking:summary-delta` | `turnId`, `partId`, `delta`                                                  | Incremental chunk of a provider-supplied thinking summary.           |
| `thinking:update`        | `turnId`, `partId`, `redacted?`, `continuity?`, `providerMetadata?`          | Non-text update to a thinking part (redaction flag, continuity).     |
| `part:end`               | `turnId`, `partId`, `timing?`                                                | The current part finished.                                           |
| `action:args-delta`      | `turnId`, `partId`, `delta`, `accumulated`                                   | Tool/agent arguments are still streaming in.                         |
| `action:running`         | `turnId`, `partId`, `parameters?`                                            | Local tool / sub-agent / provider tool started executing.            |
| `action:progress`        | `turnId`, `partId`, `chunk`                                                  | Streamed output from a running action (e.g. `execTool` stdout).      |
| `action:complete`        | `turnId`, `partId`, `result` (`ActionResult`), `timing?`                     | Action finished — inspect `result.type` for `success` vs `error`.    |
| `action:error`           | `turnId`, `partId`, `error`, `timing?`                                       | Action failed with a typed error.                                    |
| `action:child-event`     | `turnId`, `partId`, `event`                                                  | An event from a nested sub-agent run.                                |
| `annotation:start`       | `target`, `annotation`                                                       | An annotation was created on a session, turn, or part.               |
| `annotation:update`      | `target`, `annotation`                                                       | An annotation was updated.                                           |
| `annotation:end`         | `target`, `annotation`                                                       | An annotation finished (`status` defaults to `"complete"`).          |
| `error`                  | `error`                                                                      | Top-level error during the run.                                      |

### Part types

`part:start` carries a `TurnPart`, discriminated by `part.type`:

- `"text"` — assistant text. Subsequent `text:delta` events fill it in.
  `text:citation` events attach source citations to the accumulated text.
- `"citation"` — unanchored source citations emitted by the provider for the
  whole assistant turn (not tied to a specific text span). The part carries a
  `citations` array. See [Citations](#citations) below.
- `"thinking"` — reasoning content. Subsequent `thinking:delta` events fill in
  renderable thinking text; `thinking:summary-delta` events fill in a
  provider-supplied summary; `thinking:update` carries redaction flags and
  continuity payloads. Note that `ThinkingPart.text` is optional — not every
  provider exposes raw thinking text.
- `"file"` — a file attachment the assistant produced (rare).
- `"action"` — a tool, sub-agent, or provider tool call. Distinguish with
  `part.kind`: `"tool" | "agent" | "provider-tool"`.

Callbacks are registered once and fire on every subsequent `send()`.

### Citations

When a provider attaches citations to text output, `text:citation` events fire
alongside the text deltas. Each event carries a `Citation` object:

```typescript
interface Citation {
  source: CitationSource; // web | document | search-result | retrieved-context | unknown
  outputSpan?: { start?: number; end?: number };
  providerMetadata?: Record<string, unknown>;
}
```

If you use `TurnAccumulator`, citations accumulate on `TextPart.citations`
automatically — no extra reducer work is needed.

Some providers (such as OpenRouter web search) emit citations as a source list
for the whole message rather than as spans inside a text block. These arrive as
a `"citation"` part instead of `text:citation` events. Render them separately:

```typescript
for (const part of turn.parts) {
  if (part.type === "text") {
    renderText(part.text);
    renderInlineCitations(part.citations ?? []);
  }

  if (part.type === "citation") {
    renderSources(part.citations);
  }
}
```

### Thinking parts

`ThinkingPart.text` is optional in 0.21.0. Some providers supply a summary
instead of raw thinking text, and others redact thinking entirely:

```typescript
agent.on((event) => {
  if (event.type === "part:start" && event.part.type === "thinking") {
    if (event.part.redacted) {
      renderThinkingPlaceholder();
    } else if (event.part.summary) {
      renderThinkingSummary(event.part.summary);
    } else if (event.part.text) {
      renderThinkingText(event.part.text);
    }
  }
});
```

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
| `text:citation`           | A citation anchored to a specific text span (carries `citation`, `citations`). |
| `citation`                | Unanchored citations for the whole turn (carries `index`, `citations`).     |
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
