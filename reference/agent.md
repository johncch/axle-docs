---
title: Agent
description: Constructor options, methods, and result types for Agent.
---

# Agent

```typescript
import { Agent } from "@fifthrevision/axle";

new Agent(config: AgentConfig, session?: AgentSession)
```

Conceptual guide: [Agent](/concepts/agent).

## AgentConfig

Extends `AxleModelRequestOptions` minus `signal`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `provider` | `AIProvider` | — | **Required.** Provider adapter. |
| `model` | `string` | — | **Required.** Model identifier. |
| `sessionId` | `string` | `crypto.randomUUID()` | Stable conversation id. |
| `system` | `string` | — | System/developer instruction. |
| `name` | `string` | — | Agent name; appears on spans as `agentName`. |
| `tools` | `AnyTool[]` | — | Executable tools the agent runs, and deferred tools answered through `agent.onToolCall()`. |
| `providerTools` | `ProviderTool[]` | — | Provider-managed tools. |
| `skills` | `Skill[]` | — | Skills disclosed in the system prompt and loaded on demand through the `view-skill` tool. See [Skills](/concepts/skills). |
| `mcps` | `MCP[]` | — | MCP clients, resolved lazily on first send. |
| `observability` | `ObservabilityOptions` | — | Logging and tracing. |
| `fileResolver` | `FileResolver` | — | Resolves deferred file references. |
| `reasoning` | `ReasoningSetting` | — | Portable reasoning/thinking control: `"default"`, `"off"`, `"on"`, or `{ effort, display? }`. |
| `maxOutputTokens` | `number` | — | Output token cap. |
| `toolChoice` | `ToolChoice` | — | `"auto"`, `"none"`, `"required"`, `{ type: "tool", name }`. |
| `parallelToolCalls` | `boolean` | — | Ask the provider to avoid parallel tool calls. |
| `cache` | `boolean` | — | Ask the provider to cache the prompt prefix where asking is required (Anthropic, OpenRouter). Defaults to on. |
| `providerOptions` | `Record<string, any>` | — | Raw passthrough, applied after normalized mappings. |
| `turnTimeoutMs` | `number` | — | Longest a turn may run, from opening to `turn:end` — every model step, tool call, and deferred wait included. When it elapses the turn is cancelled with `{ type: "timeout", limitMs }` as the abort reason (see `isTimeoutReason`); on the send's own turn the handle rejects and `operation:end` carries it as `{ type: "cancelled", reason }`. A send's own value overrides it. |
| `streamStallMs` | `number` | — | Longest gap between two chunks from the provider — as `stream()`'s `streamStallMs`. When it passes, the step fails `ok: false` with `{ kind: "api", type: "StreamStall" }`; not retried. A send's own value overrides it. |

When both `config.sessionId` and `session.sessionId` are supplied, the restored
session id wins.

### ObservabilityOptions

| Field | Type | Description |
| --- | --- | --- |
| `level` | `EventLevel` | Minimum level. Default `"info"`. Governs only the tracer Axle creates from `log`. |
| `log` | `LogFn` | Structured sink. Axle creates and owns a tracer when `trace` is absent. |
| `trace` | `Tracer \| Span` | Bring your own. A `Tracer` gives each send its own root; a `Span` nests sends under it. Axle never ends or flushes what you pass. |

## Properties

| Property | Type | Notes |
| --- | --- | --- |
| `provider` | `AIProvider` | readonly |
| `model` | `string` | readonly |
| `name` | `string \| undefined` | readonly |
| `registry` | `ToolRegistry` | readonly |
| `skills` | `SkillRegistry` | readonly — the skills disclosed in the system prompt; mutating it rebuilds the `view-skill` tool and lands on the next provider request |
| `requestOptions` | `Omit<AxleModelRequestOptions, "signal">` | readonly |
| `fileResolver` | `FileResolver \| undefined` | readonly |
| `turnTimeoutMs` | `number \| undefined` | readonly |
| `streamStallMs` | `number \| undefined` | readonly |
| `status` | `AgentStatus` | `{ phase: "idle" }`, or `{ phase: "busy", id }` with the running operation's id. Busy covers `onStart` callbacks, the continuation, and `onSettled` — changes only at `operation:start` and `agent:idle`, and already reads the new value when the event that moved it is delivered. |
| `sessionId` | `string` | mutable |
| `system` | `string \| undefined` | readonly getter — the configured system prompt, then the skills catalog when skills are present |
| `messages` | `AxleMessage[]` | Getter returning a **copy** of the active conversation. |

## send()

```typescript
send(message: string | Instruct<undefined>, options?: SendMessageOptions): AgentHandle<string>
send<TSchema>(instruct: Instruct<TSchema>, options?: SendMessageOptions): AgentHandle<ParsedSchema<TSchema>>
```

Schedules a FIFO conversation turn and returns a handle synchronously. The user
message and its turn are built up front, so `send()` emits `pending:queued`
with a `pending` preview turn carrying the id the committed turn will have —
render `[...transcript.turns, ...transcript.pending]` keyed by id to show queued
work. A handle cancelled while still queued emits `pending:dropped` and commits
nothing.

Strings are wrapped in an `Instruct` with `vars: "optional"`. A supplied
`Instruct` is cloned, then validated — `AxleInstructVariableError` throws
synchronously from `send()` if a required variable is missing.

### SendMessageOptions

Extends `AxleModelRequestOptions`. Per-send values are merged over the agent
defaults; `providerOptions` merges key-by-key.

| Option | Type | Description |
| --- | --- | --- |
| `after` | `Continuation<T>?` | Continuation to run after this send's turn settles. Holds the queue; inline turns run via `ctx.send()`. See [after — continuations](#after-continuations). |
| `fileResolver` | `FileResolver` | Overrides the agent's resolver for this send. |
| `metadata` | `MessageMetadata` | Host-owned metadata attached to the user message and copied to the user turn. Providers ignore it. |
| `signal` | `AbortSignal` | Cancels this send. |
| `id` | `string` | Id for the send's user turn — the one `pending:queued`, `turn:user`, and `onSettled` carry. Generated when omitted. |
| `turnTimeoutMs` | `number` | This send's turn timeout, overriding the agent's `turnTimeoutMs`. |
| `streamStallMs` | `number` | This send's stall limit, overriding the agent's `streamStallMs`. |
| ...request options | | `reasoning`, `maxOutputTokens`, `toolChoice`, `parallelToolCalls`, `cache`, `providerOptions`. (`temperature`, `topP`, and `stop` were removed in 0.33.0 — use `providerOptions`.) |

### AgentHandle

```typescript
interface AgentHandle<T> {
  cancel(reason?: unknown): void;
  readonly final: Promise<AgentResult<T> | AgentErrorResult>;
}
```

### AgentResult

```typescript
interface AgentResult<T = string> {
  ok: true;
  response: T;
  error?: undefined;
  turn: Turn;
  usage: Stats;
  after?: InlineTurn[];
}

interface AgentErrorResult {
  ok: false;
  response?: undefined;
  error: AxleProviderFailure;
  turn: Turn | undefined;
  usage: Stats;
  after?: InlineTurn[];
}

type InlineTurn = { userTurn: Turn } & (
  Omit<AgentResult<unknown>, "after"> | Omit<AgentErrorResult, "after">
);
```

`AxleProviderFailure` is `{ kind: "api" }`, `{ kind: "incomplete" }`, `{ kind: "refusal" }`, or
`{ kind: "parse" }` — see [Errors](/reference/errors). `after` is present only
when the send carried a continuation: the inline turns it ran, in order.

## after — continuations

```typescript
type Continuation<T = string> = (
  result: AgentResult<T> | AgentErrorResult,
  ctx: ContinuationContext,
) => void | Promise<void>;

interface ContinuationContext {
  send(message: string | Instruct<undefined>, options?: InlineSendOptions): Promise<AgentResult<string> | AgentErrorResult>;
  send<TSchema extends OutputSchema>(instruct: Instruct<TSchema>, options?: InlineSendOptions): Promise<AgentResult<ParsedSchema<TSchema>> | AgentErrorResult>;
  readonly signal: AbortSignal;
  readonly id: string;
  readonly messages: readonly AxleMessage[];
  readonly pending: readonly Turn[];
}

type InlineSendOptions = Omit<SendMessageOptions, "after" | "signal">;
```

The continuation runs after the send's turn settles with a result (`ok` or
not); a rejected handle skips it. It holds the queue until it returns and
`ctx.send()` runs inline turns — ordinary turns except they start at once with
no `pending:queued`, carry the send's id as `threadId` on their user turn and
`Turn`, and fire no hook of their own. A continuation that throws rejects the
handle and the queue continues. `cancel()` during a continuation aborts
`ctx.signal` and any inline turn in flight; `stop()` keeps its tool-batch
meaning for an inline turn; `clear()` never touches a continuation.

## stop()

```typescript
stop(): boolean
```

Asks the active turn to finish at its next complete tool-batch boundary. The
in-flight batch executes and commits, then the handle settles without another
provider request. Returns `false` when no turn is executing. Queued sends are
unaffected.

## cancel()

```typescript
cancel(reason?: unknown): boolean
```

Cancels the active operation immediately — as if that handle's own `cancel()`
had been called. A turn that already opened settles `cancelled` with its
partial work committed. Queued operations are unaffected and the next one
starts. Returns `false` when nothing is running. While `onSettled` callbacks
run, the operation is already done, so `cancel()` (and `stop()`) return `false`.

## clear()

```typescript
clear(): number
```

Cancels every queued operation without touching the active turn. Each cleared
handle rejects with `AxleAgentAbortError`, committing nothing. Returns the number
cleared.

## on()

```typescript
on(callback: (event: AgentEvent) => void): () => void
```

Registers an event callback for all subsequent sends. Returns an unsubscribe
function. `AgentEvent` is the turn events plus the operation lifecycle
(`operation:start`, `after:start` / `after:end`, `operation:end`, `agent:idle`).
`TurnEventCallback` is removed — annotate with `AgentEventCallback`.

## onStart()

```typescript
onStart(callback: StartCallback): () => void
```

Called each time an operation takes the queue, before its turn opens — never
inside `send()` itself. `status` is already `busy` with the operation's id, and
`operation:start` has been emitted.

```typescript
type StartCallback = (operation: StartedOperation) => void | Promise<void>;

interface StartedOperation {
  kind: "send" | "compaction";
  id: string; // the one its pending:queued turn carried
  signal: AbortSignal; // aborts when the operation is cancelled
}
```

The operation does not start its work until every callback has settled, and all
callbacks run together. One that throws skips the work and the continuation:
the pending turn is dropped with the error, `onSettled` still runs with it as
the result, and the handle rejects with it. A `cancel()` while callbacks run
aborts `operation.signal`, and the work is skipped once they return. An
operation cancelled while still queued never starts and does not fire.

Do not await `send()`, `compact()`, or `snapshot()` on this agent from inside a
callback: the callback holds the queue they wait for, so the nested call
deadlocks.

## onToolCall()

```typescript
onToolCall(handler: ToolCallCallback): () => void
```

Answers the agent's deferred tool calls. One handler per agent, the dispatcher
over every deferred tool: registering another replaces it, and the returned
function removes it if it is still the one in place. The handler in place when
a turn opens is the one that turn uses. The contract is `execute`'s — return
the result, throw to give the model an error, and return nothing for a call no
branch answers. See [Deferred tools](/concepts/tools#deferred-tools).

## toolCall()

```typescript
toolCall(id: string): WaitingToolCall | undefined
```

The deferred call with this tool call id while the active turn is waiting on
it; `undefined` once it has settled or when no turn is running. `answer` gives
the model the result and `fail` an `execution` error carrying the message — the
two outcomes `onToolCall` has. Whichever of the handler, this, the tool's
`timeout`, and `cancel()` comes first settles the call.

## onSettled()

```typescript
onSettled(callback: SettledCallback): () => void
```

Fires once for every operation that started, however it ended — one send, one
call: after its turn and its continuation, before `operation:end` is emitted
and its handle settles. Inline turns a continuation sent do not fire it on
their own; their outcome arrives under the send's `result.after`. The agent is
at rest and the next queued operation has not started, so a host that reads its
`Transcript.turns` inside the callback gets turns and messages that match. An
operation cancelled while still queued never ran and does not fire.

```typescript
type SettledCallback = (
  session: AgentSession,
  operation: SettledOperation,
) => void | Promise<void>;

type SettledOperation =
  | {
      kind: "send";
      id: string; // the id its `pending:queued` turn carried
      result: PromiseSettledResult<AgentResult<unknown> | AgentErrorResult>;
    }
  | { kind: "compaction"; id: string; result: PromiseSettledResult<boolean> };
```

The session is the one `snapshot()` returns; unlike `snapshot()`, it does not
wait behind queued operations. The operation carries exactly what the handle is
about to settle with: the result on success, the rejection reason otherwise.

A callback may return a promise. The handle does not settle and the next queued
operation does not start until every callback has settled; all callbacks run
together. A callback that throws or rejects cannot affect the operation: the
error is recorded on the trace and the other callbacks still run.

Do not await `send()`, `compact()`, or `snapshot()` on this agent from inside a
callback: the callback holds the queue they wait for, so the nested call
deadlocks.

```typescript
declare const report: (reason: unknown) => void;

agent.onSettled(async (session, operation) => {
  await db.save(session.sessionId, { session, turns: transcript.turns });
  if (operation.result.status === "rejected") report(operation.result.reason);
});
```

## onIdle()

```typescript
onIdle(callback: IdleCallback): () => void
```

Called each time the agent goes from busy to idle: an operation finished and
nothing is queued behind it. Fires after the last operation's `onSettled`
callbacks have settled, and also when the queue was emptied by `clear()` while
they ran. Work scheduled during those callbacks keeps the agent busy, so it does
not fire until that work is done too.

```typescript
type IdleCallback = () => void;
```

The callback is not awaited — the agent is already free, so a `send()` from
inside it starts at once. A callback that throws is recorded on the trace and
the other callbacks still run. Use it to close whatever the host opened when
work began:

```typescript
declare const notifyClients: (event: { type: string }) => void;

agent.onIdle(() => notifyClients({ type: "run:stop" }));
```

## context()

```typescript
context(): ContextUsage
```

```typescript
interface ContextUsage {
  total: number;
  system: number;
  tools: number;
  mcpTools: number;
  providerTools: number;
  messages: number;
  limit?: number;
  free?: number;
}
```

Locally estimated, not provider-reported. `context()` supplies no `limit`, so
`limit` and `free` are always absent from its result; to fill them, call
[`estimateContextUsage`](/reference/providers#context-estimation) yourself with
a limit from the [model catalog](/concepts/model-catalog#budgeting-the-window).

## snapshot()

```typescript
snapshot(): Promise<AgentSession>
```

Resolves at once when the agent is idle, and otherwise when it next goes idle,
so the capture is always at rest — a snapshot never contains a streaming or
running turn, and it includes everything queued before the agent went idle. It
is not queued work: it does not make the agent busy, fires no `onIdle`, and is
not cancelled by `clear()`. Returns `{ sessionId, messages }`. Excludes
transcripts and all runtime objects.

**Do not await from inside a running send or an `onSettled` callback** — the
agent cannot go idle until they return, so the nested call deadlocks. To save
after each operation, use `onSettled` instead of awaiting `snapshot()` in a
loop.

## compact() and setCompaction()

```typescript
setCompaction(config: CompactionConfig): void
compact(options?: { signal?: AbortSignal }): Promise<boolean>
```

`setCompaction` replaces any previous configuration. `compact()` resolves `false`
when no config is registered, otherwise enqueues the work and resolves `true`
once applied. A queued manual compaction previews as a `pending` agent turn with
one `pending` compaction part (see [Transcript &
events](/reference/transcript#pending-lifecycle)). It bypasses
`shouldCompactOnTrigger`. Cancellation rejects with `AxleAgentAbortError`.

**Do not await from inside a running send** — it deadlocks.

See [Configuration](/reference/configuration#compaction) for `CompactionConfig`.

## MCP methods

```typescript
addMcp(mcp: MCP): void
addMcps(mcps: MCP[]): void
hasTools(): boolean
```

MCP tools resolve lazily on the first send after registration, once per client.
The client must already be connected.

## Serializable sessions

`AgentSession` (`{ sessionId, messages }`) is the saved form of a
conversation. There is no serializable agent recipe in core
(`AgentDefinition`, `createAgentConfig()`, and friends were removed in 0.35.0):
a host that saves which recipe an agent ran stores that in its own shape (a
path, a name, the parsed recipe) and rebuilds `AgentConfig` from it directly.

```typescript
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
