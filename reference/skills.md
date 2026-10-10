---
title: Skills
description: The Skill type, SkillRegistry, skill loading, and the view-skill tool.
---

# Skills

Conceptual guide: [Skills](/concepts/skills).

## Skill

```typescript
interface Skill {
  name: string;
  description: string;
  /** The SKILL.md body with its frontmatter stripped. */
  instructions: string;
  /** Opaque base the host's tools accept; printed to the model verbatim. */
  root?: string;
  /** Relative to root, forward slashes, listed not read. */
  files?: string[];
  /** Remaining frontmatter fields as written. */
  frontmatter?: SkillFrontmatter;
}

interface SkillDefinitionRef {
  name: string;
}

type SkillFrontmatter = {
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
} & Record<string, unknown>;
```

## SkillRegistry

```typescript
import { SkillRegistry } from "@fifthrevision/axle";

new SkillRegistry(tools: ToolRegistry, skills?: Skill[])
```

The skills an `Agent` discloses, changeable at any time. Owns the `view-skill`
tool: published into the agent's tool registry while at least one skill is
present, withdrawn when the last one goes, rebuilt from the current list on
every change.

| Method | Returns | Notes |
| --- | --- | --- |
| `add(skill \| skills)` | `void` | Throws `SKILL_REGISTRY_DUPLICATE` on a name already registered, `SKILL_INVALID` on a forbidden name. |
| `set(skills)` | `void` | Replaces the whole list atomically: checks every name first, so a throw leaves the old list; republishes once. A name already registered is not an error here. |
| `remove(name)` | `boolean` | Republishes when something was removed. |
| `has(name)` | `boolean` | |
| `get(name)` | `Skill \| undefined` | |
| `list()` | `Skill[]` | |
| `size` | `number` | |

Reachable as `agent.skills`; seeded by `config.skills`. Changes are visible on
the next provider request, including the next step of a running turn.

## Loading

```typescript
import { loadSkill, parseSkillMarkdown } from "@fifthrevision/axle";

loadSkill(dir: string): Promise<Skill>
parseSkillMarkdown(text: string): Omit<Skill, "root" | "files">
```

`loadSkill` loads a skill from a directory holding `SKILL.md` — the other files
under it are listed (dotfiles excluded, bounded in depth and count) but never
read. Throws `SKILL_NOT_FOUND` when there is no `SKILL.md`, `SKILL_INVALID`
when the frontmatter is missing, empty, or malformed. `parseSkillMarkdown`
parses text directly. Every frontmatter scalar is read as text (YAML failsafe
schema), so an unquoted `version: 1.0` under `metadata` stays `"1.0"`.

## Catalog and activation

```typescript
import { renderSkillsCatalog, createViewSkillTool } from "@fifthrevision/axle";

renderSkillsCatalog(skills: Skill[]): string
createViewSkillTool(skills: Skill[]): ExecutableTool
```

`renderSkillsCatalog` is the system-prompt section: a heading, a short
instruction to call `view-skill`, one `- name: description` line per skill.
Descriptions are escaped (angle brackets neutralised, line breaks collapsed).
`createViewSkillTool` is the activation tool: its `name` argument is an enum of
the loaded skills, and it returns the skill's instructions wrapped in
`<skill_content>`, with `Compatibility:`, the skill directory, and the `Files:`
listing when present.

`agent.system` is the configured prompt plus this catalog when skills are
present, and is read-only.

## Agent wiring

| Field | Type | Notes |
| --- | --- | --- |
| `AgentConfig.skills` | `Skill[]?` | Seeds `agent.skills`. |
| `Agent.skills` | `SkillRegistry` | readonly. |
| `AgentDefinition.skills` | `SkillDefinitionRef[]?` | `{ name }` — resolved to `Skill[]` by the host. |
| `ResolvedAgentDefinition.skills` | `Skill[]?` | |

`createAgentConfig()` throws when the definition names skills and the resolver
returns none, as with tools.
