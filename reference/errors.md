---
title: Errors
description: The error classes, their codes, and the failure union.
---

# Errors

Conceptual guide: [Results & errors](/concepts/results-and-errors).

Quick orientation: failures you should expect resolve as `{ ok: false }`.
Everything documented on this page throws instead.

## AxleFailure

The resolved-failure union carried in `result.error`.

```typescript
type AxleFailure =
  | { kind: "model"; error: ModelError; message: string }
  | { kind: "tool"; error: { name: string; message: string }; message: string }
  | { kind: "parse"; error: unknown; message: string };
```

`message` is always present, whatever the kind. `GenerateError` is a deprecated
alias kept for compatibility.

::: warning `ModelError` is not exported
It's referenced by `AxleFailure` but isn't importable from the package root, so
you can't name it in your own signatures. Narrow on `kind` and read
`error.error.type` / `error.error.message` instead.
:::

## AxleError

Base class for everything Axle throws.

```typescript
class AxleError extends Error {
  readonly code: string; // default "AXLE_ERROR"
  readonly id?: string;
  readonly details?: Record<string, any>;
  toJSON(): object;
}

new AxleError(message: string, options?: {
  code?: string;
  id?: string;
  details?: Record<string, any>;
  cause?: unknown;
})
```

`toJSON()` serializes name, message, code, id, details, and the whole `cause`
chain, so it's safe to log directly.

### Codes

| Code | Thrown when |
| --- | --- |
| `INVALID_OPTIONS` | `maxSteps` or `maxContextTokens` below 1; `targetTokens` too small for the compactor appendix |
| `TOOL_OPTIONS_CONFLICT` | Both `registry` and `tools`/`providerTools` passed |
| `TOOL_REGISTRY_DUPLICATE` | A tool name is already registered |
| `COMPACTION_INVALID_MESSAGES` | A compactor returned malformed messages |
| `WEB_SEARCH_FALLBACK_NOT_CONFIGURED` | `web_search` requested on a provider without native support and no fallback registered |
| `ABORTED` | On `AxleAbortError` |
| `TOOL_FATAL_ERROR` | On `AxleToolFatalError` |
| `INSTRUCT_VARIABLE_ERROR` | On `InstructVariableError` |
| `TASK_ERROR` | On `TaskError` |

`createAgentConfig()` also throws bare `AxleError`s for an unsupported definition
version, a missing model, and declared-but-unresolved tools.

## AxleAbortError

```typescript
class AxleAbortError extends AxleError {
  readonly reason: unknown;
  readonly messages?: AxleMessage[];
  readonly partial?: AxleAssistantMessage;
  readonly usage?: Stats;
}
```

Note that `name` is `"AbortError"` rather than `"AxleAbortError"`, so the
conventional `error.name === "AbortError"` check works as you'd expect.

Thrown by a cancelled `stream()` handle. It holds on to whatever was produced
before the abort.

## AxleAgentAbortError

```typescript
class AxleAgentAbortError extends AxleAbortError {
  readonly turn?: Turn;
}
```

Thrown by a cancelled `Agent` handle and by every handle dropped by
`agent.clear()`. Adds the cancelled turn. Also `name === "AbortError"`.

## AxleToolFatalError

```typescript
class AxleToolFatalError extends AxleError {
  readonly toolName?: string;
  readonly messages?: AxleMessage[];
  readonly partial?: AxleAssistantMessage;
  readonly usage?: Stats;
}

new AxleToolFatalError(message?: string, options?: {
  toolName?: string;
  messages?: AxleMessage[];
  partial?: AxleAssistantMessage;
  usage?: Stats;
  cause?: unknown;
})
```

Throw this from `execute` when you want to terminate the run. An ordinary
`Error` becomes a tool error result handed back to the model instead, which is
usually what you want.

Subagent fatal errors are rebuilt without the child's `messages`/`partial` before
reaching the parent, with the original as `cause`.

## InstructVariableError

```typescript
class InstructVariableError extends AxleError {
  readonly missingVariables: string[];
}
```

Thrown by `Instruct.validate()` and `render()` — and therefore synchronously from
`agent.send()` — when `vars` is `"required"` and inputs are missing. The message
lists the missing names.

## TaskError

```typescript
class TaskError extends AxleError {}

new TaskError(message: string, options?: {
  id?: string;
  taskType?: string;
  taskIndex?: number;
  details?: Record<string, any>;
  cause?: Error;
})
```

For task-running hosts. Core never throws it itself.

## Catching

```typescript
import { AxleAbortError, AxleToolFatalError, AxleError } from "@fifthrevision/axle";

try {
  const result = await agent.send("...").final;
  if (!result.ok) {
    // model / tool / parse — expected
    return;
  }
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    // cancelled
  } else if (error instanceof AxleToolFatalError) {
    // a tool killed the run
  } else if (error instanceof AxleError) {
    // configuration or usage bug — error.code says which
  } else {
    throw error;
  }
}
```
