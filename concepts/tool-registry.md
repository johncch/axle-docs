---
title: The tool registry
description: The agent's tool set is meant to change while it runs. The registry is what makes that possible.
---

# The tool registry

Most tool APIs treat a tool set as a constructor argument: you decide what the
agent can do, and that's what it can do forever. The registry exists because
that's the wrong shape for real agents.

**The tool set is meant to change while the agent runs.** A tool can load more
tools. A conversation can unlock capabilities as it reveals what it's about. A
user's permissions can decide what exists at all. The registry is what makes
those first-class operations instead of a rebuild.

That was the design goal from the start — the registry was introduced
specifically to support `load_tools` patterns, where a tool call mutates the
agent's own tool set mid-run.

## Loading tools with a tool

The pattern the registry was built for: a tool whose job is to make other tools
exist.

```typescript
import type { ExecutableTool } from "@fifthrevision/axle";
import * as z from "zod";

declare const toolsets: Record<string, ExecutableTool[]>;

const loadToolsSchema = z.object({
  toolset: z.enum(["database", "deploy", "analytics"]),
});

const loadTools: ExecutableTool<typeof loadToolsSchema> = {
  name: "load_tools",
  description:
    "Load a toolset when you need it. Available: 'database', 'deploy', 'analytics'.",
  schema: loadToolsSchema,
  async execute({ toolset }, ctx) {
    const loaded = toolsets[toolset];
    ctx.registry.add(loaded);
    return `Loaded: ${loaded.map((t) => t.name).join(", ")}. You can call these now.`;
  },
};

const agent = new Agent({ provider, model, tools: [loadTools] });
```

The agent starts with one tool and grows into whatever the task needs. The model
decides when to expand its own capabilities — cheaper than declaring forty tools
up front, and more accurate, since tool-selection quality degrades measurably as
the list grows.

Note the `ExecutableTool<typeof loadToolsSchema>` annotation — passing the schema
type is what gives you a typed `input` in `execute`. A bare `ExecutableTool`
compiles fine but leaves the input properties `unknown`.

Two details make it work:

- **`ctx.registry` is the live registry**, not a copy. Tools added during
  `execute` are available to the model on the next step of the *same* send.
- **Say so in the return value.** The model has no other signal that its
  capabilities changed. `"Loaded: query_db, list_tables. You can call these
  now."` is doing real work.

## The other three shapes

Same mechanism, driven by your code rather than the model's.

**Progressive disclosure.** Widen the tool set as the conversation narrows:

```typescript
declare const listProjects: ExecutableTool;
declare const deployProject: ExecutableTool;
declare const rollbackProject: ExecutableTool;

const agent = new Agent({ provider, model, tools: [listProjects] });

// once we know which project they mean
agent.registry.add([deployProject, rollbackProject]);
```

**Permissions.** The registry is the boundary the model cannot see past:

```typescript
declare const user: { canDeploy: boolean };
declare const deployTool: ExecutableTool;

if (user.canDeploy) agent.registry.add(deployTool);
```

An unregistered tool isn't in the request at all, so it can't be called or
hallucinated into being. That's a much stronger guarantee than instructing a
model not to use something.

**Phases.** Planning and editing want different toolsets on the same
conversation. Swap at the boundary instead of building a second agent:

```typescript
declare const planningTools: ExecutableTool[];
declare const editingTools: ExecutableTool[];

for (const tool of planningTools) agent.registry.remove(tool.name);
agent.registry.add(editingTools);
```

::: tip When changes take effect
`agent.registry` is live and gets handed to the tool loop on every send, so
host-side mutations land on the **next** send. Mutations from inside a tool's
`execute` land on the next step of the current send. Either way, the
[steer playbook](/concepts/agent#the-steer-playbook) gives you a clean boundary
to change things at.
:::

A word of restraint: keep tools that mutate the registry few and obvious. A tool
set that changes unpredictably is genuinely hard to debug, and a model that
wasn't told its capabilities changed will carry on as if they hadn't.

## What's actually in it

Three collections, one namespace.

| Collection | Filled by | Executed by |
| --- | --- | --- |
| **Local** | `tools:`, `registry.add()` | Your `execute` function |
| **MCP** | Resolved from `mcps:` on first send | The MCP server |
| **Provider** | `providerTools:`, `registry.addProvider()` | The provider's infrastructure |

They're stored separately because Axle handles them differently — local tools are
functions it calls, MCP tools are proxied over a transport, provider tools are
names passed to the vendor. But **names are unique across all three**, because
the model sees one flat list. A duplicate throws `TOOL_REGISTRY_DUPLICATE` at
registration rather than silently shadowing.

```typescript
agent.registry.has("get_weather"); // across all three
agent.registry.size; // total across all three
agent.registry.local(); // just yours
agent.registry.mcp(); // just MCP's
agent.registry.provider(); // just provider tools
agent.registry.executable(); // local + MCP — everything Axle actually runs
```

The `executable()` / `provider()` split is the one that matters: executables have
an `execute` function, provider tools are just names and config.

## Where your registry comes from

`Agent` builds its own. There's no `registry` option on `AgentConfig` — you pass
`tools` and `providerTools`, and the agent constructs one from them. You reach it
afterwards:

```typescript
const agent = new Agent({ provider, model, tools: [getWeather] });
agent.registry; // the one it built — mutate this
```

`generate()` and `stream()` accept a registry directly, which is how you share
one set of capabilities across many independent calls:

```typescript
declare const search: ExecutableTool;

const registry = new ToolRegistry({ tools: [getWeather, search] });

await generate({ provider, model, messages, registry });
await generate({ provider, model, messages: [...messages], registry });
```

Pass `tools`/`providerTools` **or** `registry`, never both — that throws
`TOOL_OPTIONS_CONFLICT`, since there's no sensible merge.

::: tip Sharing capabilities between agents
Since each `Agent` owns its registry, share the tool *arrays* rather than the
registry — every agent built from the same arrays ends up with an equivalent
tool set, and each can then diverge independently as its conversation goes its
own way.

Sharing one registry across `generate()` calls is fine and intentional. Mutate it
between calls rather than during them; there's no locking.
:::

## MCP arrives late

MCP tools land in the registry on the first send after the client is registered,
not when you call `addMcp()`:

```typescript
agent.addMcp(fs);
agent.registry.size; // unchanged — nothing resolved yet
await agent.send("List the files.").final; // now they're in
```

Each client resolves once and caches. That's why `hasTools()` is a method rather
than `size > 0` — it also accounts for MCP clients that haven't resolved yet.

## It shows up in context accounting

`agent.context()` reports the three kinds separately, because you trim them
differently:

```typescript
const usage = agent.context();
usage.tools; // local tool schemas
usage.mcpTools; // MCP tool schemas
usage.providerTools; // provider tool declarations
```

This is where you discover that thirty MCP tools are eating more of your window
than the conversation is. Trimming the registry is often a bigger win than
[compaction](/concepts/compaction) — and it's the measurement that tells you
whether a `load_tools` pattern is worth building.

## Building one by hand

```typescript
import { ToolRegistry } from "@fifthrevision/axle";
import type { ExecutableTool } from "@fifthrevision/axle";

declare const anotherTool: ExecutableTool;
declare const mcpClient: MCP;

const registry = new ToolRegistry({
  tools: [getWeather],
  providerTools: [{ type: "provider", name: "web_search" }],
});

registry.add(anotherTool);
registry.addProvider({ type: "provider", name: "code_execution" });
registry.addMcp(await mcpClient.listTools({ prefix: "fs" }));
registry.remove("get_weather"); // removes from whichever collection holds it
```

The collection is chosen by which `add` method you call, not by inspecting the
tool. `addMcp` exists so MCP-sourced tools stay countable separately even though
they execute like any other.

## Next

- [Tools](/concepts/tools) — what goes in the registry
- [Tools reference](/reference/tools#toolregistry) — every method
- [MCP servers](/cookbook/mcp-servers) — where MCP tools come from
