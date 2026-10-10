---
title: Configuration
description: Compaction wiring and entry points.
---

# Configuration

## Removed in 0.34.0: configureAxle()

```typescript
// @check-skip — removed in 0.34.0, kept here so the name resolves
configureAxle(options: AxleConfiguration): void
```

There is no process-global configuration anymore. Web search on a provider
without hosted search used to be a process-wide fallback backend; it is now a
tool attached to the `chatCompletions()` provider that needs it:

```typescript
import { chatCompletions, braveWebSearch } from "@fifthrevision/axle";

const provider = chatCompletions("https://api.together.ai/v1", {
  apiKey,
  webSearch: braveWebSearch({ apiKey: braveKey }),
});
```

`AxleConfiguration`, `WebSearchBackend`, `WebSearchRequest`,
`WebSearchBackendContext`, and `WebSearchResponse` are removed. A custom search
is an `ExecutableTool` passed as `webSearch`. See [Web
search](/cookbook/web-search) and [Upgrading](/upgrading).

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
  summaryWords?: number; // default 1000
  appendixTokens?: number; // default thresholdTokens / 10; 0 disables
  reasoning?: ReasoningSetting; // default unset
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
  most recent user messages verbatim. The appendix is budgeted in tokens by
  `appendixTokens` (up to the last ten user messages, evicted oldest-first); the
  summary is steered in words by `summaryWords`. The summarizer request sends no
  `maxOutputTokens`, so the provider's own ceiling bounds thinking plus summary.
- `reasoning` and `providerOptions` are passed through to the summary call, so a
  thinking-capable model can be used for compaction. `reasoning` defaults to
  unset (the model's own default); `providerOptions` defaults to none.
- Progress is emitted continuously while the summary streams.
- Messages carrying a [compaction stamp](/reference/messages#compaction-helpers)
  are treated as already-compacted and are not re-summarized.
- The transcript being summarized is declared untrusted data in the compactor's
  own system prompt.

Throws `INVALID_OPTIONS` when `thresholdTokens`, `summaryWords` is non-positive,
or `appendixTokens` is negative.

## Entry points

| Import | Contains |
| --- | --- |
| `@fifthrevision/axle` | The full runtime surface. |
| `@fifthrevision/axle/ui` | Type-only render surface plus `Transcript` — no provider SDKs. |
