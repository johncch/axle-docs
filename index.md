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

- A TypeScript-native library rather than a Python port.
- Multi-turn agents without wiring up a framework first.
- The freedom to switch providers without rewriting your agents.
- To own your own UI — Axle emits events and hands you the state to render.

## What we're going for

A small, ergonomic surface for building agents. `Agent`, `Instruct`, `stream()`,
and `generate()` are most of the library. Each has one job, and they're designed
to compose.

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

**Building blocks** are the pieces both layers use — providers, `Instruct`,
tools, results, observability. Dip in as you need them.

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
