---
title: Transcript & turn events
description: The Transcript class, the Turn/TurnPart shapes, and the full TurnEvent union.
---

# Transcript & turn events

Conceptual guide: [Turns & Transcripts](/concepts/transcripts).

Everything on this page is also available type-only from
`@fifthrevision/axle/ui`, which doesn't pull in the provider SDKs — use that
import in UI code.

## Transcript

```typescript
class Transcript<TAnnotation extends Annotation = Annotation, THostEvent extends UnknownEvent = UnknownEvent> {
  constructor(turns?: readonly Turn<TAnnotation>[]);
  get turns(): readonly Turn<TAnnotation>[];
  getTurn(turnId: string): Turn<TAnnotation> | undefined;
  apply(event: TranscriptInput<TAnnotation, THostEvent>): TranscriptApplyResult<TAnnotation, THostEvent>;
}
```

The constructor shallow-copies the array. `turns` is readonly; all structural
change goes through `apply()`.

```typescript
type TranscriptApplyResult<TAnnotation extends Annotation, THostEvent extends UnknownEvent> =
  | { handled: true; event: TurnEvent<TAnnotation> }
  | { handled: false; event: THostEvent };
```

`UnknownEvent` and `TimingInfo` are exported from `@fifthrevision/axle/ui` only,
not from the package root.

Unrecognized event types pass through with `handled: false`, so a single
dispatcher can carry both Axle events and your own.

## Turn

```typescript
interface Turn<TAnnotation extends Annotation = Annotation> {
  id: string;
  owner: "user" | "agent";
  parts: TurnPart<TAnnotation>[];
  status: TurnStatus;
  annotations?: TAnnotation[];
  metadata?: Record<string, unknown>;
  timing?: TimingInfo;
  usage?: Stats;
  error?: { type: string; message: string };
}

type TurnStatus = "streaming" | "complete" | "cancelled" | "error";
interface TimingInfo { start: string; end?: string } // ISO timestamps
```

## TurnPart

```typescript
type TurnPart =
  | TextPart
  | CitationPart
  | FilePart
  | ThinkingPart
  | ActionPart
  | CompactionPart;
```

Every part has `id`, `type`, optional `annotations`, and optional `timing`.

| Part | Additional fields |
| --- | --- |
| `TextPart` | `text: string`, `citations?: Citation[]`, `providerMetadata?` |
| `CitationPart` | `citations: Citation[]`, `providerMetadata?` |
| `FilePart` | `file: FileInfo` |
| `ThinkingPart` | `text?`, `summary?`, `redacted?`, `continuity?`, `providerMetadata?` |
| `CompactionPart` | `status: "running" \| "complete" \| "error"`, `summary?`, `progress?`, `error?` |

### ActionPart

```typescript
type ActionPart = ToolAction | SubagentAction | ProviderToolAction;
```

All share `status: "pending" | "running" | "complete" | "cancelled" | "error"`
and discriminate on `kind`.

| `kind` | `detail` |
| --- | --- |
| `"tool"` | `{ name, parameters, pendingArgs?, result? }` |
| `"agent"` | `{ name, config?, children: Turn[], result? }` |
| `"provider-tool"` | `{ name, input?, result? }` |

```typescript
type ActionResult =
  | { type: "in-progress"; content: string }
  | { type: "success"; content: unknown }
  | { type: "error"; error: { type: string; message: string } };
```

`pendingArgs` holds accumulated argument JSON before it can be parsed into
`parameters`. Render it during streaming so there's something on screen.

`SubagentAction.detail.children` is a nested `Turn[]`, so subagent rendering is
recursive.

### Annotations

```typescript
interface Annotation<TData = unknown, TKind extends string = string> {
  id: string;
  kind: TKind;
  label: string;
  placement?: "before" | "after"; // defaults to "after" when accumulated
  status?: "running" | "complete" | "cancelled" | "error";
  data?: TData;
  timing?: TimingInfo;
}
```

Your own UI state, attached to a turn or a part and never sent to a provider.
Omit `status` for static annotations that have no lifecycle.

## TurnEvent

### Turn lifecycle

| Event | Fields |
| --- | --- |
| `turn:user` | `turn` — the complete user turn |
| `turn:start` | `turnId`, `timing?` |
| `turn:end` | `turnId`, `status`, `usage`, `timing?` |

### Part streaming

| Event | Fields |
| --- | --- |
| `part:start` | `turnId`, `part` — the whole part object |
| `text:delta` | `turnId`, `partId`, `delta` |
| `text:citation` | `turnId`, `partId`, `citation` |
| `thinking:delta` | `turnId`, `partId`, `delta` |
| `thinking:summary-delta` | `turnId`, `partId`, `delta` |
| `thinking:update` | `turnId`, `partId`, `redacted?`, `continuity?`, `providerMetadata?` |
| `part:end` | `turnId`, `partId`, `timing?` |

Openings carry the full part; deltas carry only ids and the delta.

### Actions

| Event | Fields |
| --- | --- |
| `action:args-delta` | `turnId`, `partId`, `delta`, `accumulated` |
| `action:running` | `turnId`, `partId`, `parameters?` |
| `action:progress` | `turnId`, `partId`, `chunk` |
| `action:complete` | `turnId`, `partId`, `result`, `timing?` |
| `action:error` | `turnId`, `partId`, `error`, `timing?` |
| `action:child-event` | `turnId`, `partId`, `event` — a nested `TurnEvent` |

### Compaction

| Event | Fields |
| --- | --- |
| `compaction:update` | `turnId`, `partId`, `update: { summary?; progress? }` |
| `compaction:complete` | `turnId`, `partId`, `summary?`, `timing?` |
| `compaction:error` | `turnId`, `partId`, `error`, `timing?` |

The part itself arrives through `part:start` with `status: "running"`.
`compaction:complete` sets `progress: 1`.

### Annotations and errors

| Event | Fields |
| --- | --- |
| `annotation:start` | `target`, `annotation` |
| `annotation:update` | `target`, `annotation` |
| `annotation:end` | `target`, `annotation` |
| `error` | `turnId?`, `error: { type, message }` |

```typescript
type AnnotationTarget =
  | { type: "turn"; turnId: string }
  | { type: "part"; turnId: string; partId: string };
```

## TurnEventBuilder

```typescript
import { TurnEventBuilder } from "@fifthrevision/axle";
```

Converts `StreamEvent`s into `TurnEvent`s — the same translation `Agent` does
internally. You'd only need this if you're driving `stream()` directly but still
want render-layer events.
