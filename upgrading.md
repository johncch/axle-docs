---
title: Upgrading
description: Breaking changes by version, and where to find the full migration guides.
---

# Upgrading

Every release has a full migration guide in the repository under
[`docs/`](https://github.com/johncch/axle/tree/main/docs), one file each from
`0.13.0-migration.md` through `0.30.0-migration.md`. This page is the map to
them — what changed, and which ones you actually need to read.

Current release: **0.30.1**.

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
