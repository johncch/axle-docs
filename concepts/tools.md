---
title: Tools
description: Five ways to give an agent capabilities — local tools, deferred tools, provider tools, MCP, and subagents.
---

# Tools

Axle has one tool registry and four ways to fill it.

| Kind | Runs where | What you supply |
| --- | --- | --- |
| **Executable tool** | Your process | Name, description, Zod schema, `execute` |
| **Deferred tool** | Whoever holds the loop | Name, description, Zod schema — no `execute` |
| **Provider tool** | The provider's infrastructure | A name and optional config |
| **MCP tool** | An MCP server | A client config — Axle discovers the tools |
| **Subagent** | Your process, as a nested `Agent` | A child agent factory |

They all land in the same `ToolRegistry`, and the model sees one flat list. Which
means names have to be unique across all five — duplicates throw as soon as you
register them, rather than confusing the model later.

## Executable tools

A tool is a plain object. No base class, no decorator.

```typescript
import type { ExecutableTool } from "@fifthrevision/axle";
import * as z from "zod";

const getWeather: ExecutableTool = {
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({ city: z.string().describe("City name, e.g. Lisbon") }),
  async execute({ city }, ctx) {
    const res = await fetch(`https://api.example.com/weather?q=${city}`, {
      signal: ctx.signal,
    });
    return JSON.stringify(await res.json());
  },
};

const agent = new Agent({ provider, model, tools: [getWeather] });
```

::: tip Get typed input in `execute`
Declare the schema separately and pass its type:
`const tool: ExecutableTool<typeof schema> = { schema, … }`. With a bare
`ExecutableTool` annotation it still compiles, but your `input` properties come
through as `unknown`.
:::

Here's the thing worth internalizing: **the description and the schema are the
prompt for this tool.** That's where the model decides whether to call it and
what to pass. Time spent on a clear description and a `.describe()` on each
non-obvious field pays back more than almost anything else you can do.

Axle ships no concrete local tools — no filesystem, no shell. That's on purpose:
what your application should expose is your call, not the library's.

## Validated before `execute`

Every call's arguments are parsed with the tool's schema before `execute`
runs, so `execute` receives the parsed value — with schema defaults and
transforms already applied. A `z.number().default(10)` field arrives as `10`
when the model omits it; you don't re-apply defaults inside `execute`.

When the arguments don't match, `execute` is not called at all. The model
gets an error tool result it can correct in the same turn instead:

```json
{
  "error": {
    "type": "validation",
    "message": "Invalid arguments for get_weather: city: Invalid input: expected string, received undefined"
  }
}
```

The message names each issue with its path (`steps.0.label` for a bad nested
field, `items.1.description` inside a parallelized call), joined with `;`
when there are several. Because this is an ordinary tool result — not a thrown
error — the loop continues and the model usually retries with fixed arguments
in the same turn. Deferred tools validate the same way before the call reaches
your handler; executable tools always run through their own `execute` and never
consult `onToolCall` (see [Deferred tools](#deferred-tools) below).

## The tool context

`execute` gets a `ToolContext` as its second argument:

```typescript
async execute(input, ctx) {
  ctx.signal;              // AbortSignal — please forward it to your I/O
  ctx.emit("Fetching…");   // stream progress to the UI
  ctx.reportUsage(usage);  // roll a nested model call's tokens into the parent
  ctx.span;                // tracing span for this call
}
```

`ctx.emit` is what makes a slow tool feel alive — whatever you pass shows up as
`action:progress` events while `execute` is still running. Without it, a
ten-second tool just looks frozen to your user.

(`ctx.registry` was removed in 0.34.0. A tool that changes the agent it runs
under uses that agent in closure scope — `agent.registry.add(...)`,
`agent.skills.add(...)` — and the change lands on the next provider request,
even mid-turn. See [The tool registry](/concepts/tool-registry).)

## Returning more than text

`execute` can return a string, or an array of parts including files:

```typescript
async execute() {
  const image = await loadFileContent("./chart.png", "base64");
  return [
    { type: "text", text: "Chart attached." },
    { type: "file", file: image },
  ];
}
```

[Files, images & PDFs](/cookbook/files-and-images) covers URL and
deferred-reference sources.

## When a tool fails

There are two ways a call becomes an error tool result, and they're worth
telling apart. A **validation** error means the arguments never matched the
schema — `execute` never ran, and the message names each issue so the model
can fix the call. An **execution** error means `execute` ran and threw — an
ordinary throw inside `execute` becomes a tool error result that goes back to
the model, which usually retries or works around it. The run keeps going in
both cases. That's almost always what you want.

If you need to kill the run instead, throw `AxleToolFatalError` — that propagates
out of `send()` rather than resolving as a result. Save it for cases where
carrying on would be incoherent, like the sandbox your tool operates on no longer
existing. See [Results & errors](/concepts/results-and-errors).

## Deferred tools

Some calls can't be answered by code — they need a person. A deferred tool is
a tool definition with no `execute`: the model calls it like any other tool,
and whoever holds the loop answers each call.

```typescript
import type { DeferredTool } from "@fifthrevision/axle";

const askUser = {
  type: "deferred",
  name: "ask_user",
  description: "Ask the person a question and wait for their answer",
  schema: z.object({ question: z.string() }),
} satisfies DeferredTool;
```

Register it like anything else — `tools` takes executable and deferred side by
side — and answer its calls with `onToolCall`:

```typescript
const agent = new Agent({ provider, model, tools: [getWeather, askUser] });

agent.onToolCall((call) => {
  if (!isCall(askUser, call)) return;
  return prompt(call.input.question);
});
```

The handler receives one call — `{ id, name, input }`, with `input` already
validated against the schema — and the same `ToolContext` an `execute` gets.
The contract is `execute`'s: return the result, throw to hand the model an
error result with the message as the reason, and return nothing when this
branch doesn't answer. A call nobody answers doesn't fail. It waits — for
`toolCall(id)`, for the tool's `timeout`, or for cancellation:

```typescript
agent.on((event) => {
  if (event.type === "action:waiting") showPrompt(event.callId, event.input);
});

// when the person answers, from anywhere that holds the agent:
agent.toolCall(id)?.answer("teal");
```

A few things worth knowing about the wait:

- **Outside the handler, use `toolCall(id)`.** It returns `{ answer, fail }`
  while that call is waiting and `undefined` once it has settled. `fail`
  hands the model an `execution` error, the same as throwing inside the
  handler. The first settle wins; later ones do nothing.
- **`generate()` has no handle, so it fails fast.** A call the handler doesn't
  answer — or any call when there's no handler — becomes an `execution` error
  result at once, instead of waiting. On `stream()` and `Agent`, the same call
  waits.
- **`timeout` bounds the wait.** A deferred tool may set one in milliseconds;
  when it elapses, the call settles as a `timeout` error result the model reads.
  Unset, a call waits until it is answered or the run is cancelled.
- **Cancelling aborts the wait.** The handler's `signal` aborts when anything
  else settles the call, so stop prompting and drop whatever the handler later
  resolves to — it's discarded.

On the event stream, a deferred call never runs — there is no `action:running`.
The part opens `pending`, moves to `waiting` when the validated call reaches
your handler (`tool:waiting` on the stream layer, `action:waiting` on turns),
and closes with the answer. `isCall(tool, call)` narrows a handler call to one
tool with its input typed; `isActionOf(tool, part)` does the same for a
rendered part, so a UI can find the handler's promise from the part. Both live
on the main entry point and on `@fifthrevision/axle/ui`.

Reach for a deferred tool for approvals, human-in-the-loop answers, and
anything else the caller decides at runtime. If the answer is computable where
the agent runs, write an `execute` instead.

## Provider tools

Provider-managed tools run on the provider's infrastructure — hosted web search,
code execution. You name them; you don't implement them.

```typescript
import type { ProviderTool } from "@fifthrevision/axle";

const webSearch: ProviderTool = { type: "provider", name: "web_search" };
const agent = new Agent({ provider, model, providerTools: [webSearch] });
```

Axle translates the portable names `web_search` and `code_execution` into each
vendor's own name:

| Portable name | Anthropic | OpenAI | Gemini |
| --- | --- | --- | --- |
| `web_search` | `web_search_20260318` | `web_search` | `googleSearch` |
| `code_execution` | `code_execution_20260521` | `code_interpreter` | `codeExecution` |

Any other name passes through untouched, so vendor-specific tools work by naming
them directly. The optional `config` object is raw passthrough — field names and
placement differ per vendor, so anything you put there is not portable. (It also
never reaches a tool served by an attached executable — more on that in [Web
search](/cookbook/web-search).)

Results come back as `provider-tool` action parts and, for search, as
[citations](/reference/messages). See [Provider tools](/cookbook/provider-tools).

The provider owns every provider tool: core hands `providerTools` to the
provider unchanged, and each provider decides how to serve a name — as a tool
the vendor hosts, as an executable tool the provider brings (`AIProvider.tools`,
which is how `chatCompletions()` serves an attached `webSearch`), or not at
all. A provider asked for a tool it cannot serve fails the request (`ok: false`,
`error.kind` `"api"`, naming the tool) — never silently dropped, except
OpenRouter's warn-and-skip for names it doesn't map, which predates the change.

### If a provider has no native search

Ask for `web_search` on a provider that doesn't host one and the request fails —
unless you attached a search to that `chatCompletions()` provider, in which
case it runs as an ordinary tool call.

```typescript
import { chatCompletions, braveWebSearch } from "@fifthrevision/axle";

const provider = chatCompletions({ baseUrl: "http://localhost:11434/v1",
  webSearch: braveWebSearch({ apiKey: braveKey }),
});
```

Now the same agent code works against Ollama as against Anthropic — with one
visible difference: an attached search renders as `tool` parts, not
`provider-tool` parts, because that is what happened. See
[Web search](/cookbook/web-search).

## MCP servers

An `MCP` client connects to a server and brings its tools along.

```typescript
import { MCP } from "@fifthrevision/axle";

const fs = new MCP({
  transport: "stdio",
  name: "fs",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
});

await fs.connect();
const agent = new Agent({ provider, model, mcps: [fs] });
```

Both `stdio` and streamable `http` transports work.

Tool discovery is **lazy** — the agent calls `listTools()` on the first send that
needs it, once per client, and caches the result. But you do have to `connect()`
yourself first; the agent won't do it for you, and an unconnected client throws
on that first send. It's the single most common stumble here.

The client's `name` becomes a prefix on every tool it contributes, which is how
two servers can both offer a `read_file` without colliding.

Call `refreshTools()` if a server's tool list changes while running, and
`close()` when you're done.

MCP tools are validated like any other tool: the call's arguments are parsed
with the converted schema before they reach the server, and unknown top-level
keys are stripped — matching a default `z.object()` — rather than rejected.
The schema advertised to the provider carries `additionalProperties: false`,
as vendors like OpenAI require.

## Subagents

`createAgentTool` turns a whole `Agent` into a tool, so a parent model can hand
off bounded work and get back only the final answer.

```typescript
import { createAgentTool } from "@fifthrevision/axle";

const research = createAgentTool({
  name: "research",
  description: "Research a topic in depth and report findings",
  schema: z.object({ topic: z.string() }),
  createAgent: () => new Agent({ provider, model, tools: [webSearchTool] }),
  prompt: (input) => `Research ${input.topic}. Report the three key findings.`,
});
```

The child's turn events get forwarded through `ctx.emit`, so your UI can render
the nested run live as a `SubagentAction` with its own `children` turns. Its
token usage flows through `ctx.reportUsage` and rolls into the parent's totals.

Do create a **fresh** child agent per call. A shared one accumulates history
across unrelated invocations, which gets strange quickly.

## Running a tool over many inputs

`parallelize` wraps any tool in a parallelized tool: one tool whose single
call runs the inner tool over many inputs concurrently.

```typescript
import { parallelize } from "@fifthrevision/axle";

const researchBatch = parallelize(research, { maxConcurrency: 4, maxItems: 20 });
```

The call's arguments are validated like any other tool call's, so one invalid
item rejects the whole call before any item runs — with the item's path (for
example `items.2.question`) in the validation message. Once running, results
keep their input order. Ordinary per-item execution failures get reported per
item instead of failing the call, while fatal and abort errors still terminate
the run — same contract as the unwrapped tool. The parallelized tool inherits
the wrapped tool's `kind`, so parallelized subagents still stream their child
turns under its action.

## Where they all end up

All four kinds land in the same [`ToolRegistry`](/concepts/tool-registry) —
one flat namespace the model sees as a single list.

```typescript
agent.registry.size; // everything, across all four sources
```

Worth reading that page rather than treating the registry as plumbing. It exists
so the tool set can **change while the agent runs** — a tool that loads more
tools, capabilities unlocked as a conversation narrows, permissions decided
per-user. Not a constructor argument you set once.

## Next

- [The tool registry](/concepts/tool-registry) — where they live, and changing them at runtime
- [generate() & stream()](/concepts/generate-and-stream) — the tool loop without an Agent
- [Tools reference](/reference/tools)
- [Tool-using agent](/cookbook/tool-using-agent)
