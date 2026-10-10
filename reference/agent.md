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
| `tools` | `ExecutableTool[]` | — | Local executable tools. |
| `providerTools` | `ProviderTool[]` | — | Provider-managed tools. |
| `skills` | `Skill[]` | — | Skills disclosed in the system prompt and loaded on demand through the `view-skill` tool. See [Skills](/concepts/skills). |
| `mcps` | `MCP[]` | — | MCP clients, resolved lazily on first send. |
| `observability` | `ObservabilityOptions` | — | Logging and tracing. |
| `fileResolver` | `FileResolver` | — | Resolves deferred file references. |
| `reasoning` | `ReasoningSetting` | — | Portable reasoning/thinking control: `"default"`, `"off"`, `"on"`, or `{ effort, display? }`. |
| `maxOutputTokens` | `number` | — | Output token cap. |
| `toolChoice` | `ToolChoice` | — | `"auto"`, `"none"`, `"required"`, `{ type: "tool", name }`. |
| `parallelToolCalls` | `boolean` | — | Ask the provider to avoid parallel tool calls. |
| `providerOptions` | `Record<string, any>` | — | Raw passthrough, applied after normalized mappings. |

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
`Instruct` is cloned, then validated — `InstructVariableError` throws
synchronously from `send()` if a required variable is missing.

### SendMessageOptions

Extends `AxleModelRequestOptions`. Per-send values are merged over the agent
defaults; `providerOptions` merges key-by-key.

| Option | Type | Description |
| --- | --- | --- |
| `fileResolver` | `FileResolver` | Overrides the agent's resolver for this send. |
| `metadata` | `MessageMetadata` | Host-owned metadata attached to the user message and copied to the user turn. Providers ignore it. |
| `signal` | `AbortSignal` | Cancels this send. |
| ...request options | | `reasoning`, `maxOutputTokens`, `toolChoice`, `parallelToolCalls`, `providerOptions`. (`temperature`, `topP`, and `stop` were removed in 0.33.0 — use `providerOptions`.) |

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
}

interface AgentErrorResult {
  ok: false;
  response?: undefined;
  error: AxleFailure;
  turn: Turn | undefined;
  usage: Stats;
}
```

`AxleFailure` is one of `{ kind: "model" }`, `{ kind: "refusal" }`, or
`{ kind: "parse" }` — see [Errors](/reference/errors).

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
on(callback: (event: TurnEvent) => void): () => void
```

Registers a turn-event callback for all subsequent sends. Returns an
unsubscribe function.

## onSettled()

```typescript
onSettled(callback: SettledCallback): () => void
```

Fires once after every send or manual compaction that ran, however it ended:
after its `turn:end` when it opened a turn, and before its handle settles. The
agent is at rest and the next queued operation has not started, so a host that
reads its `Transcript.turns` inside the callback gets turns and messages that
match. An operation cancelled while still queued never ran and does not fire.

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

Locally estimated, not provider-reported.

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

## Serializable definitions

```typescript
createAgentConfig(
  definition: AgentDefinition,
  resolver: AgentDefinitionResolver,
): Promise<AgentConfig>
```

Throws `AxleError` when `definition.version !== 1`, when no model can be
resolved, or when the definition declares `tools` or `skills` but the resolver
returns none. Provider tools and MCP clients are constructed from the definition when the
resolver omits them.

### AgentDefinition

| Field | Type | Description |
| --- | --- | --- |
| `version` | `1` | Schema version. |
| `name` | `string?` | Agent name. |
| `provider` | `ProviderDefinition` | `{ type: string; config?: Record<string, unknown> }`. `type` is host-defined. |
| `model` | `string?` | Falls back to the resolver's model. |
| `system` | `string?` | System instruction. |
| `request` | `AgentDefinitionRequestOptions?` | Portable request defaults. |
| `tools` | `ToolDefinitionRef[]?` | `{ name, config? }`. |
| `providerTools` | `ProviderToolDefinitionRef[]?` | `{ name, config? }`. |
| `mcps` | `MCPConfig[]?` | MCP client configs. |
| `skills` | `SkillDefinitionRef[]?` | `{ name }` — resolved to `Skill[]` by the host. |

### Related types

```typescript
type AgentDefinitionResolver = (definition: AgentDefinition) => MaybePromise<ResolvedAgentDefinition>;

interface ResolvedAgentDefinition {
  provider: AIProvider;
  model?: string;
  tools?: ExecutableTool[];
  providerTools?: ProviderTool[];
  mcps?: MCP[];
  skills?: Skill[];
}

interface AgentSession {
  sessionId: string;
  messages: AxleMessage[];
}

interface SavedAgent {
  definition: AgentDefinition;
  session: AgentSession;
}
```
