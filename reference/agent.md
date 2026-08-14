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
| `mcps` | `MCP[]` | — | MCP clients, resolved lazily on first send. |
| `observability` | `ObservabilityOptions` | — | Logging and tracing. |
| `fileResolver` | `FileResolver` | — | Resolves deferred file references. |
| `reasoning` | `boolean` | — | Provider reasoning/thinking controls. |
| `maxOutputTokens` | `number` | — | Output token cap. |
| `temperature` | `number` | — | Sampling temperature. |
| `topP` | `number` | — | Nucleus sampling. |
| `stop` | `string \| string[]` | — | Stop sequences. |
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
| `requestOptions` | `Omit<AxleModelRequestOptions, "signal">` | readonly |
| `fileResolver` | `FileResolver \| undefined` | readonly |
| `sessionId` | `string` | mutable |
| `system` | `string \| undefined` | mutable |
| `messages` | `AxleMessage[]` | Getter returning a **copy** of the active conversation. |

## send()

```typescript
send(message: string | Instruct<undefined>, options?: SendMessageOptions): AgentHandle<string>
send<TSchema>(instruct: Instruct<TSchema>, options?: SendMessageOptions): AgentHandle<ParsedSchema<TSchema>>
```

Schedules a FIFO conversation turn and returns a handle synchronously.

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
| ...request options | | `reasoning`, `maxOutputTokens`, `temperature`, `topP`, `stop`, `toolChoice`, `parallelToolCalls`, `providerOptions`. |

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

`AxleFailure` is one of `{ kind: "model" }`, `{ kind: "tool" }`, or
`{ kind: "parse" }` — see [Errors](/reference/errors).

## stop()

```typescript
stop(): boolean
```

Asks the active turn to finish at its next complete tool-batch boundary. The
in-flight batch executes and commits, then the handle settles without another
provider request. Returns `false` when no turn is executing. Queued sends are
unaffected.

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

Enqueued behind in-flight sends and compactions, so the capture is always at
rest. Returns `{ sessionId, messages }`. Excludes transcripts and all runtime
objects.

**Do not await from inside a running send** — it deadlocks.

## compact() and setCompaction()

```typescript
setCompaction(config: CompactionConfig): void
compact(options?: { signal?: AbortSignal }): Promise<boolean>
```

`setCompaction` replaces any previous configuration. `compact()` resolves `false`
when no config is registered, otherwise enqueues the work and resolves `true`
once applied. It bypasses `shouldCompactOnTrigger`. Cancellation rejects with
`AxleAgentAbortError`.

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
resolved, or when the definition declares `tools` but the resolver returns none.
Provider tools and MCP clients are constructed from the definition when the
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

### Related types

```typescript
type AgentDefinitionResolver = (definition: AgentDefinition) => MaybePromise<ResolvedAgentDefinition>;

interface ResolvedAgentDefinition {
  provider: AIProvider;
  model?: string;
  tools?: ExecutableTool[];
  providerTools?: ProviderTool[];
  mcps?: MCP[];
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
