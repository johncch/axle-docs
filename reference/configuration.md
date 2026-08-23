---
title: Configuration
description: Global configuration, compaction wiring, and the file store interface.
---

# Configuration

## configureAxle()

```typescript
import { configureAxle } from "@fifthrevision/axle";

configureAxle(options: AxleConfiguration): void

interface AxleConfiguration {
  webSearchFallback?: WebSearchBackend;
}
```

Process-global and merged with the existing configuration, so repeated calls
patch rather than replace. Reads are snapshotted at the start of each
`generate()` / `stream()` call.

### webSearchFallback

When a `web_search` provider tool is requested and the active provider has no
native equivalent, Axle substitutes an executable `web_search` tool backed by
this backend.

```typescript
import { configureAxle, braveWebSearch } from "@fifthrevision/axle";

configureAxle({
  webSearchFallback: braveWebSearch({ apiKey: process.env.BRAVE_API_KEY! }),
});
```

Without a fallback, the same request throws `AxleError` with code
`WEB_SEARCH_FALLBACK_NOT_CONFIGURED`, carrying `details.provider` and
`details.model`.

Providers that resolve `web_search` natively ignore the fallback entirely. See
[Web search](/cookbook/web-search).

## Compaction

::: warning Experimental
Compaction is under active design and may change in any release.
:::

```typescript
agent.setCompaction(config: CompactionConfig): void
```

```typescript
interface CompactionConfig {
  compact: CompactionCallback;
  shouldCompactOnTrigger?: ShouldCompactOnTriggerCallback;
  triggers?: {
    beforeTurn?: boolean;
    afterTurn?: boolean;
  };
}

type CompactionTrigger = "manual" | "beforeTurn" | "afterTurn";
type AutomaticCompactionTrigger = "beforeTurn" | "afterTurn";
```

### CompactionCallback

```typescript
type CompactionCallback = (
  state: { messages: AxleMessage[] },
  context: {
    usage: ContextUsage;
    signal?: AbortSignal;
    trigger: CompactionTrigger;
    id: string;
    emit: (update: CompactionUpdate) => void;
  },
) => MaybePromise<{ messages: AxleMessage[]; summary?: string }>;

interface CompactionUpdate {
  summary?: string;
  progress?: number; // 0 to 1
}
```

Return the **complete** new conversation. There is no decline path; failures
throw. `context.id` is the compaction id, shared with the emitted
`CompactionPart`.

Returned messages are checked by `validateCompactedMessages` and rejected with
`COMPACTION_INVALID_MESSAGES` if tool calls and results are not paired and
adjacent.

### ShouldCompactOnTriggerCallback

```typescript
type ShouldCompactOnTriggerCallback = (
  state: { messages: AxleMessage[] },
  context: { usage: ContextUsage; trigger: AutomaticCompactionTrigger },
) => boolean;
```

Must be synchronous. Runs at every configured automatic boundary, so keep it
cheap. `agent.compact()` bypasses it.

## PromptCompactor

```typescript
import { PromptCompactor } from "@fifthrevision/axle";

new PromptCompactor(options: PromptCompactorOptions)
```

```typescript
interface PromptCompactorOptions {
  provider: AIProvider;
  model: string;
  prompt: string;
  thresholdTokens: number;
  targetTokens: number;
  recentUserMessages?: number; // default 10
  reasoning?: boolean; // default false
  providerOptions?: ProviderOptions;
}
```

Exposes two readonly members matching the callback types:

```typescript
agent.setCompaction({
  compact: compactor.compact,
  shouldCompactOnTrigger: compactor.shouldCompactOnTrigger,
  triggers: { beforeTurn: true },
});
```

Behavior:

- `shouldCompactOnTrigger` returns `true` when estimated context reaches
  `thresholdTokens` and there is at least one message.
- `compact` summarizes with a streaming call to `provider`/`model`, appending the
  most recent user messages verbatim. The appendix is capped at half of
  `targetTokens`; the summary gets the remainder as `maxOutputTokens`.
- `reasoning` and `providerOptions` are passed through to the summary call, so a
  thinking-capable model can be used for compaction. Both default to off / none.
- Progress is emitted continuously while the summary streams.
- Messages carrying a [compaction stamp](/reference/messages#compaction-helpers)
  are treated as already-compacted and are not re-summarized.
- The transcript being summarized is declared untrusted data in the compactor's
  own system prompt.

Throws `INVALID_OPTIONS` when `targetTokens` leaves less than one token for the
summary after the appendix.

## FileStore

```typescript
interface FileStore {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
}
```

Type only — core ships no implementation. `read` resolves `null` for a missing
path.

## Entry points

| Import | Contains |
| --- | --- |
| `@fifthrevision/axle` | The full runtime surface. |
| `@fifthrevision/axle/models` | `Models`, `ModelInfo`, `ModelMetadata`. |
| `@fifthrevision/axle/ui` | Type-only render surface plus `Transcript` — no provider SDKs. |
