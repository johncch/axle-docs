---
title: Skills
description: On-demand instructions the model loads itself — the catalog, view-skill, and live updates.
---

# Skills

A skill is packaged instructions for a specific task — how to fill a PDF, how
to run the deploy checklist — that the model loads only when the task matches.
Instead of pasting every playbook into the system prompt, you disclose a
one-line catalog and let the model pull the full text on demand.

```typescript
import { Agent, type Skill } from "@fifthrevision/axle";

const pdfFill: Skill = {
  name: "pdf-fill",
  description: "Fill a PDF form from JSON using the pdf-fill script.",
  instructions: "Run ./scripts/fill.sh with --help first. Never guess field names…",
};

const agent = new Agent({ provider, model, tools: [myTool], skills: [pdfFill] });
```

That's the whole setup. The agent's system prompt now carries a catalog section
after your prompt — one `- pdf-fill: Fill a PDF…` line — plus a `view-skill`
tool. When a task matches a description, the model calls `view-skill` with the
name and gets the full instructions back as a tool result, like any other.

## A skill is not a tool

This is the distinction worth getting right. A tool is capability — code that
runs. A skill is instructions — text the model reads. The skill above doesn't
fill PDFs; it tells the model *how* to fill them with the `exec` tool you
already registered. Skills reach files only through the tools the host
registered, which is also why they're safe to share: no skill can do anything
your tool set doesn't already allow.

In core a `Skill` is plain data:

```typescript
interface Skill {
  name: string;
  description: string;
  instructions: string; // the SKILL.md body, frontmatter stripped
  root?: string; // opaque base your tools understand — a directory, an s3:// prefix, anything
  files?: string[]; // relative to root, listed not read
  frontmatter?: SkillFrontmatter; // license, compatibility, metadata, allowed-tools
}
```

`root` is printed to the model verbatim so relative paths in `instructions`
resolve; core never reads a skill's files. `files` is a listing, not content.

## The two tiers core guarantees

Progressive disclosure in two steps. Tier one: the catalog in the system
prompt, rendered from `agent.skills` as it is right now. Tier two: the
`view-skill` tool, whose `name` argument is an enum of the loaded skills, which
returns the instructions wrapped in `<skill_content>` with the directory and
file listing when the skill has them. Tier three — reading references, running
scripts — works exactly as far as your tools can read what `root` names.

With no skills there is no surface at all: `system` is your prompt alone and no
tool is registered, at construction and after the last skill is removed. And
since the catalog lives in the system prompt, it survives compaction while
activated content compacts like any other tool result.

Two escaping details, both deliberate. Descriptions and compatibility notes are
author text the model reads for meaning, so angle brackets and line breaks are
neutralised where they're printed. The body, `root`, and file names print raw —
the body is Markdown whose code samples escaping would mangle, and the model
hands paths back to your tools exactly.

## Loading from disk

Skills on disk follow the Agent Skills format: a directory with a `SKILL.md`
whose frontmatter has `name` and `description` and whose body is the
instructions. `loadSkill` reads one; `parseSkillMarkdown` parses text you
already hold (handy for zip bundles or object storage):

```typescript
import { loadSkill, parseSkillMarkdown } from "@fifthrevision/axle";

const fromDisk = await loadSkill("./skills/pdf-fill");
```

Parsing is strict on the required fields — no frontmatter, an empty `name` or
`description`, or bad YAML throws `SKILL_INVALID` naming the field — and
lenient on the name otherwise, except for `<`, `>`, `"`, and line breaks, which
are rejected in the parser and again on registration. Don't name a host tool
`view-skill`: it collides at construction or at the `add` that would publish,
whichever comes first.

## Live updates

`agent.skills` is a `SkillRegistry` you change at any time — `add`, `remove`,
`set` (which replaces the whole list atomically), `has`, `get`, `list`, `size`.
Every change rebuilds the `view-skill` tool from the current list, and the
agent hands its prompt and tool lists to the loop at turn open and again at
every tool-batch boundary. So a change lands on the next provider request,
whether you made it between turns or from inside a tool during one:

```typescript
agent.skills.add(await loadSkill("./skills/deploy"));
agent.skills.remove("pdf-fill");
agent.skills.set([pdfFill]);
```

If your application lets users *configure* agents, definitions name skills by
reference — `skills: [{ name: "pdf-fill" }]` — and your resolver turns them
into `Skill[]`, exactly like tools. See [Sessions &
persistence](/concepts/sessions).

## Next

- [Skills reference](/reference/skills) — every signature
- [The tool registry](/concepts/tool-registry) — the sibling live collection
- [Agent](/concepts/agent) — what owns the registry
