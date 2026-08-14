# Contributing to these docs (for LLM agents)

A `CONTRIBUTING.md` for the non-human contributors. If you're an agent asked to
change this site, read this first — it covers the structure you're editing into,
the two checks that gate the build, and the rules that aren't obvious from the
files.

Humans are welcome to read it too; nothing here is agent-specific except the
directness.

# Package Manager

**This project uses pnpm, not npm.**

# Commands

- Dev server: `pnpm dev`
- Build (gated): `pnpm build` — runs both checks, then VitePress
- Build (skip checks): `pnpm build:fast`
- Check everything: `pnpm check`
- Check snippets only: `pnpm check:snippets`
- Check links only: `pnpm check:links`

`pnpm build` fails if either check fails. That is deliberate — see Verification.

# What This Site Is

Documentation for `@fifthrevision/axle`, the library in the sibling
`../axle` repo. This repo contains no library code.

The docs are written against the **published package**
(`@fifthrevision/axle` in `devDependencies`), not the local workspace. Bump
that dependency when documenting a new release.

# Site Structure

Seven sidebar groups, defined in `.vitepress/config.ts`. Each has one job.

| Group | Job |
| --- | --- |
| **Getting Started** | Empty directory → working agent. |
| **Agent** | The `Agent` layer: `Agent`, anatomy of a send, turns & transcripts, turn events, sessions, compaction. |
| **Primitives** | The layer underneath: `generate()`/`stream()` and stream events. |
| **Building blocks** | Shared by both layers: providers, `Instruct`, tools, registry, results & errors, observability. |
| **API Reference** | Exhaustive signatures and options. Teaches nothing. |
| **Cookbook** | Task-shaped recipes. |
| **Meta** | Changelog, upgrading, glossary. |

Ordering is by **importance, not dependency**. `Agent` comes before the things
it composes. Forward links are fine; readers don't read linearly.

## Tier discipline

The Concepts/Reference split only works if it's enforced:

- **Concepts** = prose, one canonical example per idea, links down to
  reference. If a concept page grows an exhaustive parameter table, that table
  belongs in Reference.
- **Reference** = signatures, every option, every type. No teaching.
- **Cookbook** = complete runnable recipes for a task.

Duplication between Concepts pages is the failure mode to watch. Each page owns
one thing — e.g. *Turns & Transcripts* owns the data model, *Turn events* owns
the stream. If you find yourself restating a neighbour, cut and link instead.

## Layer boundaries

A `Turn` is an **Agent** concept. `generate()`/`stream()` have no conversation,
so no turns — they emit `StreamEvent`, and the Agent emits `TurnEvent`. Don't
write pages that discuss both event types side by side; that was tried and read
badly.

# Sourcing Rule

**Verify every claim against `../axle/packages/axle/src`.** Not the README.

`README.md` in the library repo is derived and has drifted before — it
documented `maxIterations` for 13 releases after the option became `maxSteps`.
If a doc claim and the README disagree, the source wins, and the README is a bug
to file.

`../axle/docs/terminology.md` is **normative for vocabulary**. Message / step /
turn have exact meanings; `/glossary` on this site mirrors that file. If a page
contradicts it, the page is wrong.

`../axle/docs/architecture/*` holds design rationale worth reading before
explaining *why* something works a particular way.

# Verification

Two gates, both wired into `pnpm build`.

## `scripts/check-snippets.mjs`

Extracts every fenced `typescript`/`ts` block and type-checks it against the
published package types.

Conventions it relies on:

- A block may use names declared in **any earlier block on the same page** —
  docs elide repeated imports on purpose.
- Undefined placeholder identifiers (`provider`, `model`, `agent`, …) are
  typed via an ambient declaration block inside the script, so callbacks still
  get checked properly.
- Syntactic fragments (an object method lifted out of its object) are detected
  and skipped.
- `// @check-skip` as the first line opts a block out. Use it only for
  deliberately-invalid or removed API, as in `upgrading.md`.
- `.tsx` blocks are not checked — they're illustrative React with undefined
  components.

**Fix real errors; don't loosen the harness.** Every time it flagged something
during the initial pass it was either a genuine doc bug or a snippet worth
making self-contained. Prefer `declare const x: T;` inside a snippet over adding
another placeholder to the script.

## `scripts/check-links.mjs`

Validates internal links **and heading anchors**. VitePress checks neither
reliably, and renaming a heading silently breaks every `#anchor` pointing at it.

# Voice

Warm, direct, second person, contractions. Short sentences.

- Lead with why someone cares, then the mechanics.
- Name the confusing thing rather than pretending it isn't ("this is the most
  common stumble", "what comes back may surprise you the first time").
- Gotchas explain *why* they bite, not just the rule.
- Reference tables stay terse — that's correct for reference.
- No moralising, no marketing.

# Gotchas

- **TypeScript is pinned to 6.x.** TS 7 is the Go port and drops the compiler
  API. It also *silently skips type-checking* when it rejects a tsconfig option
  (it rejected `baseUrl` and reported a clean run). Don't upgrade without
  re-verifying the snippet checker still catches a planted error.
- **VitePress interprets `{{ }}` as Vue interpolation** — in prose and inline
  code, though not fenced blocks. Write `<code v-pre>{{name}}</code>`.
- **No redirects.** Old URLs are allowed to 404; the redirect machinery was
  removed deliberately. Don't reintroduce it without asking.
- **Twoslash doesn't work here.** It needs the TS compiler API, and its
  `floating-vue` dependency throws on SSR with VitePress 1.6.4. Revisit at
  VitePress 2.
- **The CLI (`@fifthrevision/axle-cli`) is out of scope** — being reworked, not
  documented on this site.

# Adding a Page

1. Write it in the right tier (see Tier discipline).
2. Add it to the correct group in `.vitepress/config.ts`.
3. Frontmatter: `title` and a one-sentence `description`.
4. Cross-link from related pages, and add a `## Next` list at the end.
5. `pnpm check` — fix snippet and link errors.
6. `pnpm build`.

# Updating for a New Library Release

1. Bump `@fifthrevision/axle` in `devDependencies` and reinstall.
2. `pnpm check:snippets` — removed or renamed API surfaces here first.
3. Read `../axle/CHANGELOG.md` for the release; add breaking changes to
   `upgrading.md`.
4. Regenerate `changelog.md` from the library's `CHANGELOG.md` (it's a mirror
   with frontmatter and a pointer paragraph on top).
5. Update the version label in `.vitepress/config.ts` nav.
6. If vocabulary changed, update `/glossary` and the renamed-terms table in
   `upgrading.md`.
