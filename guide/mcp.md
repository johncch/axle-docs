---
title: MCP
description: Connect to Model Context Protocol servers over stdio or HTTP.
---

# MCP

Axle supports connecting to MCP (Model Context Protocol) servers via stdio or
HTTP transport. Create an `MCP` instance, connect it, and pass it to `Agent`.

```typescript
import { Agent, MCP } from "@fifthrevision/axle";

const mcp = new MCP({
  transport: "stdio",
  name: "wc",
  command: "npx",
  args: ["tsx", "path/to/wordcount-server.ts"],
});
await mcp.connect();

const agent = new Agent({ provider, model, mcps: [mcp] });
const result = await agent.send("Count the words in 'hello world'").final;
if (!result.ok) throw new Error(result.error.kind);

await mcp.close();
```

The optional `name` field prefixes all tool names from that server (e.g.
`wc_word_count`) to avoid collisions when using multiple MCPs. When omitted,
the server's self-reported name is used as the prefix if available.

## HTTP transport

```typescript
const mcp = new MCP({
  transport: "http",
  url: "http://localhost:3100/mcp",
});
await mcp.connect();
```

HTTP transport works the same way — `connect()`, pass to `Agent`, `close()`
when finished.

## Cancellation

Abort signals propagate through MCP tool calls. Cancelling an agent run
cancels in-flight MCP requests as well.

## Lifecycle

- Always `await mcp.connect()` before passing the instance to `Agent`.
- Call `await mcp.close()` when you're done — this cleans up the underlying
  transport (e.g. terminating the child process for stdio).
