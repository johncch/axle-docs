---
title: Errors
description: The error classes, their codes, and the failure union.
---

# Errors

Conceptual guide: [Results & errors](/concepts/results-and-errors).

Quick orientation: failures you should expect resolve as `{ ok: false }`.
Everything documented on this page throws instead — except the failure union
itself, which is what `ok: false` carries.

## AxleProviderFailure

The resolved-failure union carried in `result.error`.

```typescript
type AxleProviderFailure =
  | { kind: "api"; type: string; message: string; status?: number; usage?: Stats; raw?: unknown }
  | { kind: "incomplete"; type: string; message: string; usage?: Stats; raw?: unknown }
  | { kind: "refusal"; message: string; text?: string; category?: string }
  | { kind: "parse"; message: string; cause: unknown };
```

`message` is always present, whatever the kind. (`AxleFailure` and
`GenerateError` were removed in 0.35.0 — import `AxleProviderFailure`.)

An `api` failure is a request that didn't complete — rejected, failed mid-way,
connection broke. It carries what `model` carried before 0.35.0: `type`,
`message`, `status?`, `usage?`, `raw?`. `type` is `"authentication"` when the
provider rejected the API key or token (HTTP 401 on Anthropic, OpenAI, and Chat
Completions, or Gemini's `API_KEY_INVALID`); every other failure keeps the
provider's own error type. `status` is the HTTP status when the failure was an
HTTP response, and absent for transport or mid-stream errors. A Chat
Completions non-2xx JSON body in the OpenAI shape reports the body's
`error.type` (else `error.code`) as `type` and `error.message` as `message` —
match on `status`, not on `type === "404"`.

An `incomplete` failure is a request that completed but stopped for a reason
that isn't a usable end. `type` is the stop reason verbatim, or one of
`FinishReasonError`, `IncompleteStream`, `RESPONSES_API_INCOMPLETE`. `usage` is
present — the call was charged. (Gemini's `LANGUAGE` finish reason maps to a
`refusal`, not here.)

A `refusal` means the provider declined the request or blocked its output
(added in 0.33.0). `text` is the refusal text or explanation when the provider
gave one; `category` is the provider's own name for the reason. Either can be
absent. The refused step is not stored and `step:complete` does not fire.

A `parse` failure carries the schema error as `cause` (renamed from `error` in
0.33.0).

```typescript
// @check-skip — shows the pre-0.35 shape
type AxleFailure =
  | { kind: "model"; type: string; message: string; status?: number }
  | { kind: "refusal"; message: string }
  | { kind: "parse"; message: string; cause: unknown };
```

## AxleError

Base class for everything Axle throws.

```typescript
class AxleError extends Error {
  readonly code: AxleErrorCode;
  readonly id?: string;
  readonly details?: Record<string, unknown>;
  toJSON(): object;
}

new AxleError(message: string, options?: {
  code?: AxleErrorCode;
  id?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
})

import { AxleErrorCode, isAxleError } from "@fifthrevision/axle";

try {
  await agent.send("...").final;
} catch (error) {
  if (!isAxleError(error)) throw error;
  switch (error.code) {
    case AxleErrorCode.ABORTED: break;
    case AxleErrorCode.TOOL_FATAL_ERROR: break;
    case AxleErrorCode.PROVIDER_UNSUPPORTED: break;
  }
}
```

`code` is `AxleErrorCode`, a union of string literals. `details` is
`Record<string, unknown>`. The payload classes (`AxleAbortError`,
`AxleToolFatalError`, `AxleInstructVariableError`) declare their `code` as a
literal so a `switch` on `error.code` narrows to the class. `isAxleError`
tests for an `Error` carrying an `AxleErrorCode`, not `instanceof` — so it
holds when a host has two copies of the package. Prefer it over
`instanceof AxleError`.

`toJSON()` serializes name, message, code, id, details, and the whole `cause`
chain, so it's safe to log directly.

### Codes

| Code | Thrown when |
| --- | --- |
| `INVALID_OPTIONS` | A loop limit below 1; a non-integer `maxRetries` or `timeoutMs`; a bad model id; an unsupported reasoning setting; a tool choice naming an absent tool; a tool schema Zod cannot express as JSON Schema; a Brave option out of range |
| `PROVIDER_UNSUPPORTED` | A feature this provider has no wire shape for: a non-PDF document, an unsupported image type, a content source with no block type, Gemini `parallelToolCalls: false` or provider tool choice, a Chat Completions provider tool with nothing to serve it, a PDF on Together AI. `details: { protocol, feature }` names the `protocol` |
| `FILE_UNREADABLE` | A host file that could not be resolved: not found, too large, unsupported type, wrong category, no `fileResolver`. `details: { path?, name? }` |
| `MCP_NOT_CONNECTED` | An MCP tool called before `connect()` |
| `TOOL_REGISTRY_DUPLICATE` | A tool name is already registered |
| `SKILL_REGISTRY_DUPLICATE` | A skill name is already registered, or listed twice in `set()` |
| `SKILL_INVALID` | A `SKILL.md` has no frontmatter block, a missing or empty `name`/`description`, invalid YAML, a mistyped optional field, or a name containing `<`, `>`, `"`, or a line break |
| `SKILL_NOT_FOUND` | `loadSkill(dir)` found no `SKILL.md` in the directory |
| `INSTRUCT_VARIABLE_ERROR` | On `AxleInstructVariableError` |
| `COMPACTION_INVALID_MESSAGES` | A compactor returned malformed messages |
| `COMPACTION_GENERATION_FAILED` | Compaction generation failed |
| `COMPACTION_EMPTY_SUMMARY` | A compactor returned an empty summary |
| `DECISION_REQUEST_FAILED` | A decision provider request failed with a non-2xx status |
| `DECISION_RESPONSE_INVALID` | A decision provider returned a body Axle could not read |
| `DECISION_ANSWER_MISMATCH` | `decide()` got a missing or mistyped answer for a question |
| `TOOL_FATAL_ERROR` | On `AxleToolFatalError` |
| `ABORTED` | On `AxleAbortError` |
| `AXLE_ERROR` | Default for `new AxleError(message)` |

(`TOOL_OPTIONS_CONFLICT` and `WEB_SEARCH_FALLBACK_NOT_CONFIGURED` were removed
in 0.34.0 with `StreamParams.registry` and `configureAxle`. `TASK_ERROR` is
gone in 0.35.0 with `TaskError`. See [Upgrading](/upgrading).)

`decide()` throws its `DECISION_*` failures instead of resolving them — there is
no partial state to hand back, so there is no `ok` flag. See
[Decisions](/concepts/decisions).

A `chatCompletions()` request that times out fails as an `api` failure with
`type: "TimeoutError"` and message `"Request timed out after <n>ms"` (changed
from `AbortError` / `"Request aborted"` in 0.34.0). Match on `TimeoutError` to
detect it; aborting through your own signal still reports `AbortError`.

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
conventional `error.name === "AbortError"` check works as you'd expect. Carries
`reason`, `usage`, and partial output — `code` is `"ABORTED"`.

Thrown by a cancelled `stream()` handle. It holds on to whatever was produced
before the abort — including the tool results message when the abort landed
mid-tool-batch (each unfinished call reads `cancelled`), so `messages` ends
in the `tool` message and the history stays sendable.

## AxleAgentAbortError

```typescript
class AxleAgentAbortError extends AxleAbortError {
  readonly turn?: Turn;
}
```

Thrown by a cancelled `Agent` handle and by every handle dropped by
`agent.clear()`. Adds the cancelled turn. Also `name === "AbortError"`. When
the cancel landed mid-tool-batch, `messages` (and `agent.messages`) end in the
committed tool results message rather than in unanswered calls, so a follow-up
send is accepted. When it landed while the model was still writing its
response, the partial keeps only written parts and is `undefined` when nothing
was written (no assistant message is added).

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
usually what you want. `code` is `"TOOL_FATAL_ERROR"`. The batch's other calls
are aborted and answered as `cancelled`, the fatal call itself is answered as
`fatal`, and the tool results message commits before the error is thrown — so
`messages` ends in the `tool` message and the conversation stays sendable.

Subagent fatal errors are rebuilt without the child's `messages`/`partial` before
reaching the parent, with the original as `cause`.

## AxleInstructVariableError

```typescript
class AxleInstructVariableError extends AxleError {
  readonly missingVariables: string[];
}
```

(`AxleInstructVariableError` was renamed in 0.35.0.) Thrown by `Instruct.validate()`
and `render()` — and therefore synchronously from `agent.send()` — when `vars`
is `"required"` and inputs are missing. The message lists the missing names.
`code` is `"INSTRUCT_VARIABLE_ERROR"`.

## Catching

```typescript
import { AxleAbortError, AxleToolFatalError, AxleError, isAxleError } from "@fifthrevision/axle";

try {
  const result = await agent.send("...").final;
  if (!result.ok) {
    // api / incomplete / refusal / parse — expected
    return;
  }
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    // cancelled
  } else if (error instanceof AxleToolFatalError) {
    // a tool killed the run
  } else if (isAxleError(error)) {
    // configuration or usage bug — error.code says which
  } else {
    throw error;
  }
}
```
