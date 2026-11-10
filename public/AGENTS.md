# Axle for coding agents

You are writing code that *uses* `@fifthrevision/axle`. This page is the short
contract: the things that are easy to get wrong and expensive to debug. Full
docs: https://axle.fifthrevision.com/llms-full.txt

## 1. Check the installed version before you write anything

The public surface moved at 0.33, 0.35 and 0.36. Read the version from the
project's `package.json`, and treat anything you remember as suspect.

| If you were about to write | Since |
| --- | --- |
| `temperature`, `topP`, `stop` as request options | Removed in 0.33 — send them through `providerOptions` |
| an import from `@fifthrevision/axle/models` | Removed in 0.33 — model ids are plain strings |
| `AxleFailure`, `GenerateError` | `AxleProviderFailure` in 0.35 |
| `AIProvider.name` | `protocol` + `id` in 0.35 |
| `onToolCall` to intercept a normal tool | 0.36 — it answers **deferred** tools only |
| `TurnEventCallback` | `AgentEventCallback` in 0.36 |
| `onSettled` firing per turn | 0.36 — once per operation, after its continuation |

Every rename: https://axle.fifthrevision.com/upgrading

## 2. Two entry points

- `@fifthrevision/axle` — everything.
- `@fifthrevision/axle/ui` — the render and client surface (`Transcript`,
  `Instruct`, `computeCost`, `isCall`, `isActionOf`, `RemoteAgent`,
  `httpTransport`, `renderTerminalMarkdown`, and the types). It pulls in
  `chalk`, `marked` and `zod` and **no provider SDKs**, so use it in browser
  code.

## 3. A correct minimal program

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";

const agent = new Agent({
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-sonnet-4-5",
});

const result = await agent.send("What is the capital of France?").final;
if (result.ok) console.log(result.response);
```

Axle never reads environment variables itself — the key is an argument.

## 4. Failures are values; mistakes throw

- `ok: false` means the provider answered and you won't like it:
  `error.kind` is `"api" | "incomplete" | "refusal" | "parse"`.
- A **throw** means you made a mistake, or the run was cancelled: `AxleError`
  (with a `code`), `AxleAgentAbortError`, `AxleToolFatalError`,
  `AxleInstructVariableError`.

So a bad model id, a duplicate tool name or an unreadable file **throws before
any request is sent** — don't write `if (!result.ok)` and expect to catch it.
Handle both: check `result.ok`, and wrap the await.

## 5. Tool loop invariants

Get these wrong and you ship a race condition.

- **A step's tool calls run concurrently.** Every call starts before the loop
  waits on any of them. State shared between calls is yours to guard.
- **Results answer in request order**, whatever order the calls finished in.
- **An ordinary `throw` inside `execute`** becomes that call's error result; the
  siblings run to completion and the model sees every result.
- **`AxleToolFatalError`** aborts the siblings through their signal, appends no
  tool results message at all, and rejects the send.
- **`ctx.signal` is the batch's signal, not the run's.** It also aborts when a
  sibling call fails fatally. Forward it to your I/O.
- **Arguments are validated before `execute`** and `execute` receives the parsed
  value, so schema defaults and transforms already applied.
- **A deferred tool has no `execute`.** Answer its calls from `onToolCall`, or
  from outside with `agent.toolCall(id)?.answer(...)`. An unanswered call waits.

## 6. Don't render `agent.messages`

`agent.messages` is the wire format. The render layer is the `TurnEvent` stream
folded into turns:

```typescript
import { Transcript } from "@fifthrevision/axle/ui";

const transcript = new Transcript();
agent.on(transcript.apply);
```

Persist **both** halves, separately: `await agent.snapshot()` for the
conversation and `transcript.turns` for what the reader sees. Never persist
`transcript.pending` — it's live state. Restore with
`new Agent(config, session)` and `new Transcript(saved.turns)`.

## 7. Looks right, isn't

- `agent.context()` carries no `limit` or `free`. Pass a `limit` to
  `estimateContextUsage` yourself if you want them.
- A hand-built `Stats` needs `breakdown` — build it with `attributeStats`.
- `new ModelCatalog(JSON.parse(text))` — read saved catalog JSON with
  `parseCatalogData` instead, which validates the version.
- A `RemoteAgent` send's handle has only `final` (no `cancel`), and a remote
  result has no `after`.
- `cache: false` means "don't ask the provider to cache", not "don't cache".

## 8. Vocabulary, used exactly

**message** = wire, **step** = one provider request plus its tool batch,
**turn** = one render-layer entry. One `send()` is one or more steps and
produces one user turn and one agent turn. The full list:
https://axle.fifthrevision.com/glossary
