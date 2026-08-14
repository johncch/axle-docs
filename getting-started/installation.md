---
title: Installation
description: Install Axle and point it at a provider.
---

# Installation

```bash
npm install @fifthrevision/axle
```

```bash
pnpm add @fifthrevision/axle
```

```bash
yarn add @fifthrevision/axle
```

Zod comes along as a direct dependency, so schemas work right away:

```typescript
import * as z from "zod";
```

## What you'll need

- **Node.js 22 or newer.** Axle uses `Promise.withResolvers` and
  `AbortSignal.any`, which landed in 22. CI builds and tests on Node 24.
- **An ESM project.** The package ships `"type": "module"` with no CommonJS
  build, so `require("@fifthrevision/axle")` won't work.
- **An API key** for Anthropic, OpenAI, or Gemini — or a local
  OpenAI-compatible endpoint like Ollama or vLLM, which needs no key at all.

## The three entry points

Most of the time you'll only use the first one.

| Import | What's in it |
| --- | --- |
| `@fifthrevision/axle` | Everything: `Agent`, `Instruct`, providers, `stream()`, `generate()`, tools, MCP, errors. |
| `@fifthrevision/axle/models` | The `Models` catalog and `ModelInfo` metadata — context windows, output limits, multimodal support. |
| `@fifthrevision/axle/ui` | A type-only surface for renderers: `Turn`, `TurnEvent`, `Transcript`, `Citation`, `Stats`. Import this in UI code so you don't pull three provider SDKs into your browser bundle. |

## API keys

Axle never reads environment variables behind your back — you hand the key to
the provider factory yourself. Load it however you like:

```typescript
import { anthropic, openai, gemini, chatCompletions } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
```

Running against a local model? No key needed:

```typescript
const local = chatCompletions("http://localhost:11434/v1");
```

[Providers & models](/concepts/providers) covers the full list, plus retry and
timeout options.

## Next

- [Quick Start](/getting-started/quick-start) — a working agent in a few lines.
- [Anatomy of a send](/concepts/anatomy-of-a-send) — the model behind the API.
