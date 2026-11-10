---
title: Introduction
description: What Axle is, why it exists, and how these docs are organized.
---

# Introduction

Axle is a TypeScript library for building multi-turn LLM agents. You get an
`Agent` that owns a conversation, a tool loop that runs to completion, structured
output backed by Zod, and one event stream you can render — all working the same
way across Anthropic, OpenAI, Gemini, and any OpenAI-compatible endpoint.

It's a library, not a framework. There's no graph to declare, no runtime to host,
no DSL to learn. You make an object and call `send()`.

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";

const agent = new Agent({
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-sonnet-4-5",
});

const result = await agent.send("What is the capital of France?").final;
if (result.ok) console.log(result.response);
```

That's a complete program. Everything else in these docs builds on it.

## Is this for you?

Probably, if you want:

- **TypeScript, end to end.** Zod-typed tools, typed structured output, typed
  events. No `any` at the seams, no Python port.
- **Any provider, one agent.** Anthropic, OpenAI, Gemini, Bedrock, OpenRouter,
  Ollama. Change two constructor fields — your tools, `Instruct`s and event
  handling don't move.
- **A library, not a framework.** No graph to declare, no runtime to host, no
  conventions to learn. You make an object and call `send()`. `Agent`,
  `Instruct`, `stream()` and `generate()` is most of the library.
- **State that's ready to render.** `Transcript` folds the event stream into
  turns and parts shaped the way UIs actually are — streaming text, tool calls
  with their arguments and results, thinking, citations, files. Hand it to your
  components.
- **To cross a network cleanly.** Events are JSON and sessions are
  serializable, so you can stream a run to the browser and fold it there. The
  `/ui` import keeps three provider SDKs out of your bundle, and `RemoteAgent`
  drives a server-side agent from the client, picking up where a dropped
  connection left off.
- **The hard parts already solved.** A programmable queue you can interrupt and
  steer, concurrent tool batches, compaction, thinking continuity across turns,
  token usage and cost per request — the things you find out about three weeks
  into a hand-rolled loop.

Probably not, if you want:

- A graph to declare, or a platform to deploy onto.
- Durable, checkpointed workflows. Axle runs *inside* the engine you already
  trust, rather than replacing it.
- Memory, RAG and evals in one box.

## What we're going for

A small, ergonomic surface for building agents. Each piece has one job, and
they're designed to compose rather than to be configured.

Axle started life as a DSPy-inspired workflow tool. As models got better at
reasoning and tool use, rigid workflow graphs stopped earning their keep — but
the goals behind them (structured output, verification, multi-step reasoning)
didn't go away. So the project shifted toward making those capabilities
composable primitives instead of fixed pipelines.

Axle powers [Sunnyday](https://www.sunnyday.run), a hosted AI agent platform, and
forms the core of [Axle CLI](https://www.npmjs.com/package/@fifthrevision/axle-cli)
and experiments like [Axle Code](https://github.com/johncch/axle-code).

## Finding your way around

**Getting Started** takes you from an empty directory to a working agent.

**Agent** is the main path — start with
[Anatomy of a send](/concepts/anatomy-of-a-send), which sets up three words
(messages, steps, turns) that the rest of the docs lean on constantly. It's a
five-minute read and it makes everything after it easier.

**Primitives** is the layer underneath: `generate()` and `stream()`, for when you
want the tool loop without a conversation.

**Building blocks** are the pieces both layers use — providers, the model
catalog, `Instruct`, tools, results, observability. Dip in as you need them.

**API Reference** is the exhaustive listing: what a thing accepts, what it
returns. It doesn't teach, it just tells you.

**Cookbook** is task-shaped recipes. Streaming to a UI, attaching files,
cancelling a run, delegating to subagents.

## What's not here yet

A few honest gaps, so you don't go looking:

- No multi-modal *output*. Models can read images and PDFs, but Axle won't
  surface generated images or audio.
- Compaction is marked experimental and may change in any release.
- Axle CLI is being reworked, so it isn't documented on this site yet.

## Where to next

- [Installation](/getting-started/installation) and [Quick Start](/getting-started/quick-start)
- [Anatomy of a send](/concepts/anatomy-of-a-send) — the mental model
- [Agent](/concepts/agent) — the interface you'll use most
- [AGENTS.md](https://axle.fifthrevision.com/AGENTS.md) — the one-page contract
  for coding agents, alongside
  [llms.txt](https://axle.fifthrevision.com/llms.txt) and
  [llms-full.txt](https://axle.fifthrevision.com/llms-full.txt)
