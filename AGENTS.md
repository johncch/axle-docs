# Agent Guidance

See [LLM-CONTRIBUTING.md](./LLM-CONTRIBUTING.md) — structure, verification
gates, voice, and the sourcing rule for this documentation site.

Two things that matter most if you read nothing else:

- **`pnpm build` runs type-checking over every code snippet and validates every
  link and anchor.** Fix real errors; don't loosen the harness.
- **Verify API claims against `../axle/packages/axle/src`, never the library
  README** — the README has drifted by 13 releases before.

This file is for agents working **on** the docs site. The file for agents
writing code **against** Axle is `public/AGENTS.md`, which is published at
`/AGENTS.md`. They are different audiences; don't merge them.
