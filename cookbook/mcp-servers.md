---
title: MCP servers
description: Connecting stdio and HTTP MCP servers to an agent.
---

# MCP servers

## stdio

```typescript
import { Agent, MCP, anthropic } from "@fifthrevision/axle";

const fs = new MCP({
  transport: "stdio",
  name: "fs",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/sandbox"],
});

await fs.connect();

const agent = new Agent({
  provider: anthropic(process.env.ANTHROPIC_API_KEY!),
  model: "claude-sonnet-4-5",
  mcps: [fs],
});

const result = await agent.send("What files are in the sandbox?").final;

await fs.close();
```

**Connect before the first send.** The agent resolves tools lazily, but it won't
connect for you — an unconnected client throws
`MCP not connected. Call connect() first.` This is the most common stumble with
MCP, so it's worth putting `await mcp.connect()` right next to the constructor.

## HTTP

```typescript
const remote = new MCP({
  transport: "http",
  name: "docs",
  url: "https://mcp.example.com/mcp",
  headers: { Authorization: `Bearer ${token}` },
});

await remote.connect();
```

Same shape, using the MCP streamable HTTP transport.

## Several servers

```typescript
const agent = new Agent({ provider, model, mcps: [fs, github, docs] });
```

Each client's `name` prefixes the tools it contributes, which is how two servers
can both expose a `read_file` without colliding.

Do set `name` on every client. Without it, the prefix falls back to whatever the
server advertises about itself, and two servers can end up colliding with
`TOOL_REGISTRY_DUPLICATE` at registration time.

## Adding one later

```typescript
agent.addMcp(newServer);
agent.addMcps([a, b]);
```

Tools resolve on the next send. Each client resolves once and caches the result,
so call `refreshTools()` if a server's tool list changes while you're running.

## Lifecycle in a long-running process

```typescript
const servers = [fs, github];
await Promise.all(servers.map((s) => s.connect()));

try {
  // ... many agents, many sends
} finally {
  await Promise.all(servers.map((s) => s.close()));
}
```

For a stdio server, `close()` shuts down the child process — skip it and you'll
leak one per session, which adds up fast in a long-running server.

## Mixing MCP with local tools

They all share one registry, and the model sees one flat list:

```typescript
const agent = new Agent({
  provider,
  model,
  tools: [myLocalTool],
  providerTools: [{ type: "provider", name: "web_search" }],
  mcps: [fs],
});
```

Names have to be unique across all three, though the MCP prefix usually keeps
them apart without you doing anything.

## Inspecting what a server offers

```typescript
await fs.connect();
const tools = await fs.listTools({ prefix: "fs" });
console.log(tools.map((t) => `${t.name}: ${t.description}`));
```

Worth doing once when you integrate a new server. A server offering forty tools
will noticeably degrade tool-selection accuracy, and you may decide to wrap a
subset of them yourself instead.

## Trust

One thing to keep in mind: MCP tool descriptions come from the server, and they
go to the model as instructions. So a server you don't control can put text into
your prompt.

Treat third-party servers the way you'd treat any untrusted plugin — sandbox what
they can reach, and don't grant write access you haven't reviewed.

## See also

- [Tools](/concepts/tools#mcp-servers)
- [MCP reference](/reference/mcp)
