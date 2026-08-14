---
title: MCP
description: The MCP client — configuration, connection lifecycle, and tool discovery.
---

# MCP

```typescript
import { MCP } from "@fifthrevision/axle";

new MCP(config: MCPConfig)
```

Conceptual guide: [Tools](/concepts/tools#mcp-servers).

## Configuration

```typescript
type MCPConfig = MCPStdioConfig | MCPHttpConfig;

interface MCPStdioConfig {
  transport: "stdio";
  name?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface MCPHttpConfig {
  transport: "http";
  name?: string;
  url: string;
  headers?: Record<string, string>;
}
```

`http` uses the MCP streamable HTTP transport.

## Properties

| Property | Type | Notes |
| --- | --- | --- |
| `name` | `string \| undefined` | The configured name, falling back to the server's advertised name once connected. |
| `connected` | `boolean` | |

## Methods

```typescript
connect(options?: { span?: Span; signal?: AbortSignal }): Promise<void>
listTools(options?: { prefix?: string; span?: Span; signal?: AbortSignal }): Promise<ExecutableTool[]>
listToolDefinitions(options?: { prefix?: string; span?: Span; signal?: AbortSignal }): Promise<ToolDefinition[]>
refreshTools(): Promise<ExecutableTool[]>
close(options?: { span?: Span }): Promise<void>
```

| Method | Notes |
| --- | --- |
| `connect()` | No-op when already connected. Failures propagate. |
| `listTools()` | Throws if not connected. Results are cached after the first call. `prefix` namespaces every tool name. |
| `listToolDefinitions()` | Same, returning schema-only definitions. |
| `refreshTools()` | Clears the cache and re-lists. Use when a server's tools change at runtime. |
| `close()` | No-op when not connected. Clears the client, transport, and cache. |

Calling `listTools()` before `connect()` throws
`Error("MCP not connected. Call connect() first.")` — the most common mistake
here.

## Use with Agent

```typescript
const fs = new MCP({
  transport: "stdio",
  name: "fs",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
});

await fs.connect();

const agent = new Agent({ provider, model, mcps: [fs] });
// or later:
agent.addMcp(fs);
agent.addMcps([fs, other]);
```

The agent resolves each client's tools **lazily**, on the first send after
registration, and only once per client instance. It passes the client's `name` as
the tool prefix and registers the results as MCP tools in the registry.

The agent will **not** connect for you, so connect before the first send.

Tool names mustn't collide with local or provider tools, or you'll get
`TOOL_REGISTRY_DUPLICATE`. Giving each client a distinct `name` is what keeps two
servers' identically-named tools apart.

## Serializable configuration

`MCPConfig` is serializable, so it can live inside an
[`AgentDefinition`](/reference/agent#agentdefinition). `createAgentConfig()` will
construct `MCP` instances from `definition.mcps` when your resolver doesn't
supply them — though those instances still need connecting.
