---
title: Upgrading
description: Breaking changes by version, and where to find the full migration guides.
---

# Upgrading

Every release has a full migration guide in the repository under
[`docs/`](https://github.com/johncch/axle/tree/main/docs), one file each from
`0.13.0-migration.md` through `0.33.0-migration.md`. This page is the map to
them — what changed, and which ones you actually need to read.

Current release: **0.33.0**.

## 0.33.0 — no registry, flat failures, portable provider tools

Six breaking changes in the library surface (plus CLI changes, which are out of
scope for this site). The migration guide is
[`docs/0.33.0-migration.md`](https://github.com/johncch/axle/blob/main/docs/0.33.0-migration.md)
in the library repo.

**The model registry is removed.** The `@fifthrevision/axle/models` entry point
no longer exists — no `Models`, no `ModelInfo`, no `ModelMetadata`. Pass model
IDs as plain strings (`"openai/gpt-5.5"`); first-party providers still accept
both the publisher-qualified form (`"openai/gpt-5.5"`) and the bare id
(`"gpt-5.5"`). An application that needs a context window or an output ceiling
keeps its own table or asks the provider's models API. OpenRouter IDs are sent
unchanged — the alias table (`zai/glm-5.3` → `z-ai/glm-5.3`) is gone, so pass
the slug OpenRouter lists.

```typescript
// @check-skip — shows the pre-0.33 API
import { Models } from "@fifthrevision/axle/models";
const model = Models.OpenAI.GPT_5_5;
```

```typescript
const model = "openai/gpt-5.5";
```

**`temperature`, `topP`, and `stop` are removed.** They are gone from
`AxleModelRequestOptions`, and so from `generate()`, `stream()`, `Agent`,
`agent.send()`, and an agent definition's `request` block. Send them through
`providerOptions` using the provider's own field names:

```typescript
// @check-skip — shows the pre-0.33 API
await generate({ provider, model, messages, temperature: 0.2 });
```

```typescript
await generate({ provider, model, messages, providerOptions: { temperature: 0.2 } });
```

| Removed option | Anthropic | OpenAI | Gemini | Chat Completions |
| --- | --- | --- | --- | --- |
| `temperature` | `temperature` | `temperature` | `temperature` | `temperature` |
| `topP` | `top_p` | `top_p` | `topP` | `top_p` |
| `stop` | `stop_sequences` | not supported | `stopSequences` | `stop` |

**Provider tool parts have one shape on every provider.** A `provider-tool` part
now carries portable `input` and `result` plus per-provider `continuity`, and a
new `provider-tool-result` part holds results that arrive a step later. There is
a new `ConsoleOutput` shape for code execution output, and two new stream/turn
events (`provider-tool:input`, `provider-tool:error` / `action:input`); `output`
is gone from `provider-tool:complete`. See [Provider tools](/cookbook/provider-tools)
and [Messages & parts](/reference/messages).

**A refusal is its own failure kind.** `generate()`, `stream().final`, and
`agent.send().final` now resolve `{ kind: "refusal", message, text?, category? }`
when a provider declines or blocks output, instead of empty successes or
mislabeled `model` failures. Code that switches over `error.kind` needs a
`"refusal"` case. See [Results & errors](/concepts/results-and-errors).

**Failures are flat, and a rejected key is `type: "authentication"`.**
`AxleFailure` no longer nests under `error` — the `model` member carries `type`,
`message`, `status?`, `usage?`, and `raw?` directly, `ModelError` is removed,
the never-produced `tool` member is gone, and parse failures carry `cause`
instead of `error`. HTTP 401 (and Gemini's `API_KEY_INVALID`) reports
`type: "authentication"`. Chat Completions HTTP errors report the body's
`error.type` / `error.message` with `status` alongside. See
[Errors](/reference/errors).

```typescript
// @check-skip — shows the pre-0.33 shape
type AxleFailure =
  | { kind: "model"; error: ModelError; message: string }
  | { kind: "tool"; error: { name: string; message: string }; message: string }
  | { kind: "parse"; error: unknown; message: string };
```

```typescript
type AxleFailure =
  | { kind: "model"; type: string; message: string; status?: number; usage?: Stats; raw?: unknown }
  | { kind: "refusal"; message: string; text?: string; category?: string }
  | { kind: "parse"; message: string; cause: unknown };
```

**`AxleStopReason.Error` and `AxleStopReason.Custom` are removed.**
`finishReason` is now `stop`, `length`, `function_call`, or `cancelled`. Unknown
stop reasons fail the request instead of resolving `ok: true`.

Behavior changes worth knowing: Anthropic `pause_turn` responses continue
automatically within one step; `Agent` forwards its `sessionId` to OpenRouter;
Anthropic's implicit `max_tokens` defaults to 128,000; adjacent text parts
concatenate without separators; `web_search` resolves to newer provider versions
(`web_search_20260318` with `allowed_callers: ["direct"]` on Anthropic,
`web_search` on OpenAI) and Gemini searches surface a `provider-tool` part;
OpenAI replays assistant items in order and truncations finish with `length`.

[Full guide](https://github.com/johncch/axle/blob/main/docs/0.33.0-migration.md).

## 0.32.0 — thinking parts, disclosure control, one transport

Three breaking changes, all on the reasoning surface, plus one removal. The
migration guide is
[`docs/0.32.0-migration.md`](https://github.com/johncch/axle/blob/main/docs/0.32.0-migration.md)
in the library repo.

**Turn thinking parts carry `summary` / `raw`, not `text` / `redacted`.**
`ThinkingPart` on a turn now names each content field for what the provider
handed back: `summary` is the provider's condensed account, `raw` is the chain
of thought itself (open-weight models only). Neither present is the withheld
state — render `summary ?? raw`. A part opens with no content field; a field
appears only once a delta wrote it, so never test for `""`. Anthropic block
content that used to land in `text` now lands in `summary`. The message-layer
`ContentPartThinking` keeps the wire vocabulary (`text`, `summary`, `redacted`)
because it exists to be echoed back, not read — and `redacted` there now means
only that the provider substituted an opaque payload.

```typescript
// @check-skip — shows the pre-0.32 shape
interface ThinkingPart {
  text?: string;
  summary?: string;
  redacted?: boolean;
}
```

```typescript
interface ThinkingPart {
  id: string;
  type: "thinking";
  summary?: string; // the provider's condensed account
  raw?: string; // the chain of thought itself; open-weight models only
}
```

Persisted 0.31 turns carry the old shape and Axle ships no shim — a host that
stores turns decides whether to migrate rows or render both.

**Thinking events are renamed and reshaped.** `thinking:delta` (stream and
turn) is now `thinking:raw-delta`; the names say which field they grow.
`thinking:summary-delta` and `thinking:update` keep their names but lose the
`redacted` flag. Stream `thinking:start` loses `redacted` too, and stream
`thinking:end` reports `{ summary?, raw? }` — each present only if written —
instead of a single `final` string.

| 0.31 | 0.32 |
| --- | --- |
| `thinking:delta` (stream and turn) | `thinking:raw-delta` |
| stream `thinking:start` `.redacted` | removed |
| stream and turn `thinking:update` `.redacted` | removed |
| stream `thinking:end` `{ final: string }` | `{ summary?, raw? }`, each present only if written |

**`reasoning` gains a `display` disclosure control.** The object form accepts
`display: "visible" | "hidden"` (default `"visible"`):

```typescript
type ReasoningSetting = "default" | "off" | "on" | { effort: ReasoningEffort; display?: ReasoningDisplay };
```

`display` says whether the provider should show its thinking, never in what
form — whether a summary or raw text comes back is the model's property,
recorded on the thinking part. Enabling reasoning (`"on"` or `{ effort }`) now
also requests disclosure wherever a request field exists (Anthropic
`summarized`, OpenAI `summary: "auto"`, Gemini `includeThoughts: true`), so
Claude and OpenAI models that previously streamed no thinking now do. To keep
the 0.31 wire behaviour, pass `display: "hidden"` per request. Under `"hidden"`
the turn receives no thinking content — the message keeps whatever the wire
carried, so provider continuity still round-trips. Fine-grained values
(OpenAI `concise` / `detailed`, Anthropic `updates`) stay in `providerOptions`;
overriding `thinking` on Anthropic replaces the whole object, `type` included.

**`generateStep` is removed.** The single non-streaming model request no longer
exists — there is no non-streaming request to make. Call `stream()` with
`maxSteps: 1` and read `final`, or `generate()` with the same option. Custom
providers implement `createStreamingRequest` only; `createGenerationRequest` is
gone from the `AIProvider` interface. Behaviourally, `generate()` is now exactly
`stream().final`: Anthropic's implicit `max_tokens` on `generate()` rises to the
model-registry ceiling (else 64,000), retryable failures surface at first byte,
and `raw` on the error result preserves the adapter's raw error payload rather
than the vendor's buffered response object.

See [Reasoning models](/cookbook/reasoning) for the full story.
[Full guide](https://github.com/johncch/axle/blob/main/docs/0.32.0-migration.md).

## 0.31.0 — portable reasoning & compaction sizing

Two breaking changes, both in the request surface. The CLI was redesigned too,
but it's out of scope for this site — see the library's
[`packages/axle-cli/CHANGELOG.md`](https://github.com/johncch/axle/blob/main/packages/axle-cli/CHANGELOG.md)
for that.

**`reasoning` is a portable setting, not a boolean.** It was `reasoning?: boolean`
on `Agent`, `generate()`, `stream()`, and `PromptCompactor`; it's now
`reasoning?: ReasoningSetting`:

```typescript
type ReasoningEffort = "low" | "medium" | "high";
type ReasoningSetting = "default" | "off" | "on" | { effort: ReasoningEffort };
```

Booleans are now a type error. The nearest replacements and what changes on the
wire:

| 0.30    | 0.31                   | What changes                                                                                                                                              |
| ------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| omitted | omitted or `"default"` | none; no reasoning fields are sent                                                                                                                         |
| `true`  | `"on"`                 | **medium effort, not high.** Pass `{ effort: "high" }` to keep the old depth.                                                                             |
| `false` | `"off"`                | **Anthropic sends `thinking: { type: "disabled" }`** and **Gemini sends `thinkingBudget: 0`** instead of nothing; some always-thinking models reject it. |

See [Reasoning models](/cookbook/reasoning) for the full story.
[Full guide](https://github.com/johncch/axle/blob/main/docs/0.31.0-migration.md).

**`PromptCompactor` sizing changed.** `targetTokens` and `recentUserMessages`
are removed; `summaryWords` and `appendixTokens` replace them:

```typescript
// @check-skip — shows the pre-0.31 API
new PromptCompactor({
  provider,
  model,
  prompt,
  thresholdTokens: 100_000,
  targetTokens: 30_000,
  recentUserMessages: 10,
});
```

```typescript
new PromptCompactor({
  provider,
  model,
  prompt: "Summarize this conversation, preserving decisions and open questions.",
  thresholdTokens: 100_000,
  summaryWords: 1_500, // default 1000
  appendixTokens: 15_000, // default: thresholdTokens / 10; 0 disables
});
```

The summary is steered in **words** (not capped by an output token budget), and
the recent-user-message appendix is budgeted in **tokens** directly (not by
message count). The summarizer request no longer sends `maxOutputTokens`, so
thinking models summarize reliably at any reasoning setting. See
[Compaction](/concepts/compaction).

**Housekeeping:** the unused `FileStore` type export was removed.

## 0.30.0 — host-owned transcripts

This is the big one — the largest breaking change in the library's history. If
you're on 0.29 or earlier, it's worth reading
[the full guide](https://github.com/johncch/axle/blob/main/docs/0.30.0-migration.md)
rather than just this summary.

**Transcripts moved to the host.** The agent no longer keeps renderable history.

```typescript
// @check-skip — shows the pre-0.30 API
// before — agent owned it
agent.history;

// after — you own it
const transcript = new Transcript();
agent.on((event) => transcript.apply(event));
transcript.turns;
```

Use `agent.messages` for the active model-facing conversation. Persist
`transcript.turns` alongside `agent.snapshot()` — the session no longer carries
render state. See [Transcripts](/concepts/transcripts).

**`TurnAccumulator` → `Transcript`.** Renamed, with the related persistence
exports.

**Built-in memory APIs removed.** There's no automatic recall/record behaviour
any more. Replace it with tools for model-directed memory, and
[`Instruct.addContext()`](/concepts/instruct#host-context-vs-your-prompt) for
host-provided context.

**Session-level annotations removed.** Annotations now attach to turns or parts
instead. Session-wide application state is yours to keep.

**Compaction restructured** into three layers — `triggers`, `shouldCompactOnTrigger`,
and `compact` — with stateful compaction parts and
`compaction:update` / `:complete` / `:error` events. Automatic compaction failures
are now recorded on the transcript without failing the user turn. See
[Compaction](/concepts/compaction).

## 0.29.0 — step terminology

The tool-loop unit was renamed from "turn" to "step", because "turn" already
meant the render-layer unit.

| Before | After |
| --- | --- |
| `maxIterations` | `maxSteps` |
| `"max-iterations"` | `"max-steps"` |
| `turn:start` / `turn:complete` (stream events) | `step:start` / `step:complete` |
| `generateTurn` | `generateStep` |

If you're wondering why the rename happened: "turn" was already taken by the
render layer, so the same word meant two different things. [Glossary](/glossary)
has the current vocabulary.

## 0.28.0

- Added `agent.stop()` and `agent.clear()`.
- Added `PromptCompactor` and automatic before/after-turn compaction triggers.

## 0.26.0

- **Loop limits became stops, not errors.** `maxSteps` and `maxContextTokens`
  return `ok: true` with `stopped` instead of an error result. Non-positive
  limits throw at call time. See
  [Results & errors](/concepts/results-and-errors#stops-arent-errors).
- `agent.history.log` → `agent.history.messages` (and later `agent.messages`).
- `agent.snapshot()` became async.
- `Agent.restore()` removed — resume with `new Agent(config, session)`.
- `index` removed from `StreamEvent`; correlate tool events by `id`.
- `createHandle` export removed.

## 0.25.0

- Added the [web search fallback](/cookbook/web-search).

## 0.24.0

- Added experimental [subagent tools](/cookbook/subagents) and `parallelize`.
- `Agent.on()` began returning an unsubscribe function.
- **Behavior change:** in `stream()`, an `onToolCall` returning `null`/`undefined`
  falls through to the matching registry tool, matching `generate()`.
- **Behavior change:** a tool throwing an error merely *named* `AbortError` while
  the run's signal is live is reported as an ordinary tool error rather than
  aborting the run.

## 0.20.0

- **The library and CLI split into separate packages.** `@fifthrevision/axle` is
  the library; `@fifthrevision/axle-cli` is the `axle` command.
- Added `AgentSession`, snapshot/restore, and `createAgentConfig`.

## 0.18.0

- Request options were standardized across providers — output tokens,
  temperature, top-p, stop sequences, tool choice, and provider-specific options.
  Provider option types and runtime parameters were renamed;
  [see the guide](https://github.com/johncch/axle/blob/main/docs/0.18.0-migration.md).

## 0.17.0

- `Instruct` moved to object-style constructor options.
- `Instruct` schema typing widened to any Zod schema.
- Clearer errors for missing template variables.
  [Full guide](https://github.com/johncch/axle/blob/main/docs/0.17.0-migration.md).

## 0.15.0

- Aborts throw instead of resolving. See
  [Interrupting & cancelling](/cookbook/cancellation).

## 0.13.0

- Provider tool registries, streamed tool output and arguments.
  [Full guide](https://github.com/johncch/axle/blob/main/docs/0.13.0-migration.md).

## About the CLI

`@fifthrevision/axle-cli` is being reworked, so it isn't documented on this site
yet. You can still install it separately:

```bash
npm install -g @fifthrevision/axle-cli
```

## See also

- [Changelog](/changelog)
- [Glossary](/glossary)
