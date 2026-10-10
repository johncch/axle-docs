---
title: Results & errors
description: What resolves, what throws, and where Axle draws the line.
---

# Results & errors

Axle splits failures into two piles. **Things you should expect resolve. Things
that mean something is broken throw.** Once that clicks, the rest of this page is
detail.

The reasoning: a rate limit or a malformed JSON response isn't exceptional — it's
an ordinary Tuesday for an LLM application, and it deserves a branch in your code
rather than a `try`/`catch`. Whereas "you cancelled this" or "two tools have the
same name" really are exceptional.

## The result shape

`generate(...)`, `stream(...).final`, and `agent.send(...).final` all resolve to
the same two-state union:

```typescript
const result = await agent.send("...").final;

if (!result.ok) {
  result.error.kind; // "model" | "refusal" | "parse"
  result.error.message; // always there
  return;
}

result.response; // always there when ok
result.usage; // token totals
result.turn; // the renderable agent turn
```

TypeScript narrows on `ok`, so `response` is simply unreachable in the failure
branch. You can't forget to check.

The shapes differ in one respect. `AgentResult` carries `turn`; `GenerateResult`
and `StreamResult` carry `messages`, `final`, and `stopped` instead. `Agent`
doesn't expose the loop budgets (`maxSteps`, `maxContextTokens`), so there's no
`stopped` on its results — see [Stops aren't errors](#stops-arent-errors).

### The three kinds of failure

| `kind` | What happened |
| --- | --- |
| `model` | The provider returned an error — rate limit, bad request, overload. `type` names it (`"authentication"` when your key was rejected); `status` carries the HTTP status when there was one |
| `refusal` | The provider declined the request or blocked its output — a safety refusal, a content filter, a blocked prompt. `text` and `category` carry what the provider said, when it said anything |
| `parse` | The response didn't match your `Instruct` schema |

A refusal is not a model error and not an empty success. Before 0.33.0 an
Anthropic refusal arrived as `ok: true` with `finishReason: "error"`, an OpenAI
or Chat Completions refusal as `ok: true` with empty content, and a Gemini block
as a `model` failure — now all of them resolve `ok: false` with
`kind: "refusal"`. Branch on it explicitly: retrying won't help, and falling
through to your generic model-error path will mislead. The refused step is not
stored — `messages` holds only the steps that completed before it — and after a
refused `agent.send()` the agent's history ends with the user message. A refusal
the model writes as ordinary text is still a normal `ok: true` answer; only
provider-marked refusals take this branch.

Failures are flat: a `model` failure carries `type`, `message`, `status?`,
`usage?`, and `raw?` directly on `error` (no nested `error` object since
0.33.0). To detect a bad key, check
`!result.ok && result.error.kind === "model" && result.error.type === "authentication"`
instead of digging through `raw.status` or message strings. Two more `type`
values worth knowing: `"TimeoutError"` means a `chatCompletions()` request
timed out (match on it rather than `AbortError`, which now means only your own
signal fired), and a provider tool no provider serves — `web_search` with
nothing attached, say — fails the request as a `model` failure naming the tool.
See [Errors](/reference/errors) for the full union.

### What `response` holds

| Call | `response` |
| --- | --- |
| `agent.send("text")` | The assistant's text |
| `agent.send(instruct)` with a schema | The parsed, typed object |
| `generate(...)` / `stream(...)`, plain | The final `AxleAssistantMessage` |
| `generate(...)` / `stream(...)` with `instruct` | The parsed value |

There's an asymmetry there worth flagging: `Agent` unwraps to text, while the
low-level functions hand you the whole message. That's deliberate — down at that
level you usually want the content parts, not just the text.

## Stops aren't errors

`maxSteps` and `maxContextTokens` put a bound on the tool loop. They're options
on `generate()` and `stream()` — `Agent` doesn't take them, so this whole
section is about the low-level functions. Crossing either one is a **stop**, not
a failure:

```typescript
const result = await generate({ provider, model, messages, tools, maxSteps: 5 });

if (result.ok && result.stopped === "max-steps") {
  // conversation is well-formed and continuable — your call what happens next
}
```

You get `ok: true` with everything accumulated so far, and a conversation that's
valid to continue from. `final.finishReason` keeps the provider's own reason,
usually `function_call`, because the model wanted to keep going.

::: tip A combination that looks alarming but isn't
A limit stop usually lands on a tool-call step with no parseable text. So an
`Instruct` call to `generate()` or `stream()` can come back `ok: false` with
`kind: "parse"` **and** a `stopped` marker. That means "continuable, limit
tripped" — not "the model produced garbage." Check `stopped` before you
conclude the model misbehaved.
:::

Non-positive limits are a caller bug, so those throw at call time.

## What throws

| Thrown | When |
| --- | --- |
| `AxleAgentAbortError` | An `Agent` handle was cancelled, or its queue was cleared |
| `AxleAbortError` | A `stream()` handle was cancelled |
| `AxleToolFatalError` | A tool threw `AxleToolFatalError` — the run can't continue |
| `InstructVariableError` | A required <code v-pre>{{variable}}</code> had no input |
| `AxleError` | Configuration mistakes — duplicate tool name, conflicting options, invalid limits |

Every one of these is either "you cancelled it" or "something's wired wrong."
Neither belongs in a result union you'd branch on.

They all extend `AxleError`, which carries a `code`, optional `details`, and a
`toJSON()` that serializes the whole cause chain — so logging one is a one-liner.

## Cancellation

Standard JavaScript abort semantics, so your existing habits work:

```typescript
const handle = agent.send("Long task...");
setTimeout(() => handle.cancel("timeout"), 5000);

try {
  const result = await handle.final;
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    // AxleAbortError sets name = "AbortError", so this catches both
  } else {
    throw error;
  }
}
```

`AxleAbortError.name` is `"AbortError"`, so the conventional check works. Use
`instanceof` when you want the extra fields:

```typescript
error.reason; // whatever you passed to cancel()
error.usage; // tokens spent before the abort
error.messages; // messages completed before the abort
error.partial; // the partially-streamed assistant message
error.turn; // AxleAgentAbortError only — the cancelled turn
```

That partial state is kept on purpose. A cancelled long generation still cost you
money and still produced text — you'll usually want to show it.

For what commits when you cancel, and how `cancel()` differs from `stop()` and
`clear()`, see [Agent](/concepts/agent#interrupting-four-different-things).

## Tool errors: ordinary vs. fatal

Inside `execute`, an ordinary throw is handled gracefully:

```typescript
async execute(input, ctx) {
  throw new Error("Service unavailable"); // → tool error result, model sees it, loop continues
}
```

To end the run instead:

```typescript
import { AxleToolFatalError } from "@fifthrevision/axle";

async execute(input, ctx) {
  throw new AxleToolFatalError("Sandbox destroyed", { toolName: "run_command" });
  // → propagates out of send(), loop terminates
}
```

Default to ordinary throws. Models are pretty good at recovering from a tool that
says "that didn't work." Reserve fatal for when continuing would be incoherent —
the environment your tool operates on is gone.

One nicety: a subagent's fatal errors get re-wrapped before they reach the
parent, so the parent never accidentally adopts the child conversation's
messages. Usage is preserved for accounting.

## Next

- [Agent](/concepts/agent)
- [Errors reference](/reference/errors)
- [Interrupting & cancelling](/cookbook/cancellation)
