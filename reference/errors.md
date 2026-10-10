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
  | { kind: "model"; type: string; message: string; status?: number; usage?: Stats; raw?: unknown }
  | { kind: "refusal"; message: string; text?: string; category?: string }
  | { kind: "parse"; message: string; cause: unknown };
```

`message` is always present, whatever the kind. `GenerateError` is a deprecated
alias kept for compatibility.

A `model` failure carries the fields directly — there is no nested `ModelError`
(it was removed in 0.33.0, along with the never-produced `tool` member). `type`
is `"authentication"` when the provider rejected the API key or token (HTTP 401
on Anthropic, OpenAI, and Chat Completions, or Gemini's `API_KEY_INVALID`);
every other failure keeps the provider's own error type. `status` is the HTTP
status when the failure was an HTTP response, and absent for transport or
mid-stream errors. A Chat Completions non-2xx JSON body in the OpenAI shape
reports the body's `error.type` (else `error.code`) as `type` and
`error.message` as `message` — match on `status`, not on `type === "404"`.

A `refusal` means the provider declined the request or blocked its output
(added in 0.33.0). `text` is the refusal text or explanation when the provider
gave one; `category` is the provider's own name for the reason. Either can be
absent. The refused step is not stored and `step:complete` does not fire. Code
that switches over `error.kind` needs a `"refusal"` case — see
[Results & errors](/concepts/results-and-errors).

A `parse` failure carries the schema error as `cause` (renamed from `error` in
0.33.0).

```typescript
// @check-skip — shows the pre-0.33 shape
type AxleFailure =
  | { kind: "model"; error: ModelError; message: string }
  | { kind: "tool"; error: { name: string; message: string }; message: string }
  | { kind: "parse"; error: unknown; message: string };
```

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
| `INVALID_OPTIONS` | `maxSteps` or `maxContextTokens` below 1; `PromptCompactor` `thresholdTokens`/`summaryWords` non-positive or `appendixTokens` negative |
| `TOOL_REGISTRY_DUPLICATE` | A tool name is already registered |
| `SKILL_INVALID` | A `SKILL.md` has no frontmatter block, a missing or empty `name`/`description`, invalid YAML, a mistyped optional field, or a name containing `<`, `>`, `"`, or a line break |
| `SKILL_NOT_FOUND` | `loadSkill(dir)` found no `SKILL.md` in the directory |
| `SKILL_REGISTRY_DUPLICATE` | A skill name is already registered, or listed twice in `set()` |
| `DECISION_ANSWER_MISMATCH` | `decide()` got a missing or mistyped answer for a question |
| `DECISION_REQUEST_FAILED` | A decision provider request failed with a non-2xx status |
| `DECISION_RESPONSE_INVALID` | A decision provider returned a body Axle could not read |
| `COMPACTION_INVALID_MESSAGES` | A compactor returned malformed messages |
| `ABORTED` | On `AxleAbortError` |
| `TOOL_FATAL_ERROR` | On `AxleToolFatalError` |
| `INSTRUCT_VARIABLE_ERROR` | On `InstructVariableError` |
| `TASK_ERROR` | On `TaskError` |

(`TOOL_OPTIONS_CONFLICT` and `WEB_SEARCH_FALLBACK_NOT_CONFIGURED` were removed
in 0.34.0 with `StreamParams.registry` and `configureAxle`. See
[Upgrading](/upgrading).)

`decide()` throws its `DECISION_*` failures instead of resolving them — there is
no partial state to hand back, so there is no `ok` flag. See
[Decisions](/concepts/decisions).

A `chatCompletions()` request that times out fails as a `model` failure with
`type: "TimeoutError"` and message `"Request timed out after <n>ms"` (changed
from `AbortError` / `"Request aborted"` in 0.34.0). Match on `TimeoutError` to
detect it; aborting through your own signal still reports `AbortError`.

`createAgentConfig()` also throws bare `AxleError`s for an unsupported definition
version, a missing model, and declared-but-unresolved tools or skills.

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
    // model / refusal / parse — expected
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
