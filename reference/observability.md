---
title: Observability
description: Tracer, spans, writers, and log entries.
---

# Observability

Conceptual guide: [Observability](/concepts/observability).

## ObservabilityOptions

```typescript
interface ObservabilityOptions {
  level?: EventLevel; // default "info"
  log?: LogFn;
  trace?: Tracer | Span;
}

type EventLevel = "trace" | "debug" | "info" | "warn" | "error";
```

Supply `log` and Axle creates and owns a tracer, flushing it after each
operation. Supply `trace` to bring your own — Axle attaches spans but never ends
or flushes it. `level` governs only the tracer Axle creates from `log`.

## Tracer

```typescript
class Tracer {
  constructor(options?: TracerOptions);
  get minLevel(): EventLevel;
  set minLevel(level: EventLevel);
  addWriter(writer: TraceWriter): void;
  removeWriter(writer: TraceWriter): void;
  startSpan(name: string, options?: SpanOptions): Span;
  flush(): Promise<void>;
}

interface TracerOptions {
  minLevel?: EventLevel;
  writers?: TraceWriter[];
}
```

## Span

```typescript
interface Span {
  startSpan(name: string, options?: SpanOptions): Span;
  end(status?: SpanStatus): void;

  trace(message: string, attributes?: Record<string, unknown>): void;
  debug(message: string, attributes?: Record<string, unknown>): void;
  info(message: string, attributes?: Record<string, unknown>): void;
  warn(message: string, attributes?: Record<string, unknown>): void;
  error(message: string, attributes?: Record<string, unknown>): void;

  setAttribute(key: string, value: unknown): void;
  setAttributes(attributes: Record<string, unknown>): void;
  setResult(result: SpanResult): void;
}

type SpanStatus = "ok" | "error" | "cancelled";
interface SpanOptions { type?: SpanType; attributes?: Record<string, unknown> }
type SpanType = string; // conventions: "workflow" | "llm" | "tool" | "action" | "internal"
```

`end()` defaults to `"ok"`.

## SpanData

What writers receive.

```typescript
interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  type?: SpanType;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  result?: SpanResult;
}

interface SpanEvent {
  name: string;
  timestamp: number;
  level: EventLevel;
  attributes?: Record<string, unknown>;
}
```

## SpanResult

```typescript
type SpanResult = LLMResult | ToolResult;

interface LLMResult {
  kind: "llm";
  model: string;
  request: { messages: unknown[]; system?: string; tools?: unknown[] };
  response: { content: unknown };
  usage?: TokenUsage;
  finishReason?: string;
}

interface ToolResult {
  kind: "tool";
  name: string;
  input: unknown;
  output: unknown;
}

interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  reasoningOutputTokens?: number;
}
```

`TokenUsage` is the observability shape; `Stats` is the result shape. They carry
the same numbers under different names.

## TraceWriter

```typescript
interface TraceWriter {
  onSpanStart(span: SpanData): void;
  onSpanUpdate?(span: SpanData): void;
  onSpanEnd(span: SpanData): void;
  onEvent?(span: SpanData, event: SpanEvent): void;
  flush?(): Promise<void>;
}
```

## LogWriter

```typescript
class LogWriter implements TraceWriter {
  constructor(log: LogFn);
}

type LogFn = (entry: LogEntry) => void;

interface LogEntry {
  level: EventLevel;
  message: string;
  fields?: Record<string, unknown>;
}
```

Projects the span tree into flat, correlated log entries. Each completed span
becomes one line whose `message` is the span name and whose `fields` carry the
span attributes plus `type`, `status`, `traceId`, `spanId`, `parentSpanId`, and
`durationMs`.

Level mapping for completed spans:

| Span | Level |
| --- | --- |
| `status === "error"` | `error` |
| `type` is `"tool"` or `"workflow"` | `info` |
| everything else | `debug` |

So the info stream reads as a narrative — the run and its tool calls — while the
full tree is available at debug.

## SimpleWriter

```typescript
class SimpleWriter implements TraceWriter {
  constructor(options?: SimpleWriterOptions);
}
```

```typescript
interface SimpleWriterOptions {
  minLevel?: EventLevel; // default "info"
  showInternal?: boolean; // default false
  showTimestamp?: boolean; // default true
  showDuration?: boolean; // default true
  markdown?: boolean; // default false — renders events flagged markdown: true
  output?: (line: string) => void; // default console.log
}
```

Human-readable console output for development. `showInternal: true` is the
equivalent of a `--debug` flag.

## Span names and attributes

| Span | Type | Attributes |
| --- | --- | --- |
| `agent.send` | `workflow` | `sessionId`, `agentName?`, `finishReason?`, `inputTokens`, `outputTokens` |
| `agent.compact` | `workflow` | `sessionId`, `trigger`, `agentName?`, `outcome`, `beforeTokens?`, `afterTokens?` |
| `stream` | `internal` | — |
| `step-N` | `llm` | Set by the provider adapter; carries an `LLMResult`. |
| `<tool name>` | `tool` | Carries a `ToolResult`. Available in `execute` as `ctx.span`. |
| `mcp:connect` | `internal` | — |

`agent.compact` sets `outcome` to `complete`, `skipped`, or `error`.
