---
title: Introduction
description: A small, focused TypeScript library for building multi-turn LLM agents.
---

# Introduction

Axle is a TypeScript library for building multi-turn LLM agents. It provides a
small, focused API for building agentic applications.

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY);
const agent = new Agent({ provider, model: "claude-sonnet-4-5-20250929" });

const r1 = await agent.send("What is the capital of France?").final;
if (!r1.ok) throw new Error(r1.error.kind);
console.log(r1.response); // "Paris is the capital of France."

// Multi-turn — history is managed automatically
const r2 = await agent.send("And what about Germany?").final;
if (!r2.ok) throw new Error(r2.error.kind);
```

## Philosophy

Axle has two big goals:

1. **A small, focused, and ergonomic interface for building agents.** The
   `Agent`, `Instruct`, and other APIs are the entire surface, and there is a
   lot of thought to make them distinct and composable.
2. **Systematic prompt improvement.** Log what was sent, validate what came
   back, feed learnings into the next run. (This is where the roadmap is
   headed.)

Axle started as a DSPy-inspired workflow tool. As models got better with
reasoning and tool use, rigid workflow graphs felt unnecessary — but the goals
behind them (structured output, verification, multi-step reasoning) didn't go
away. The project shifted toward making those capabilities composable
primitives rather than fixed pipelines.

## Roadmap

- **Memory:** Ways to remember previous runs to retrieve them and add them
  back into the prompt for future runs.
- **Verification:** Automatic and manual ways to verify the output hits goals.

## Where to next

- [Installation](/getting-started/installation) and [Quick Start](/getting-started/quick-start)
- [Agent](/guide/agent) — the primary interface
- [Instruct](/guide/instruct) — structured output, file inputs, templated prompts
- [CLI](/cli/overview) — declarative job runner

## Known limitations

1. Axle does not support multi-modal output right now.
