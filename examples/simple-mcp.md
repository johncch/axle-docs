---
title: MCP servers
description: Connect to an MCP server over stdio or HTTP and use its tools from an agent.
---

# MCP servers

Create an `MCP` instance, `connect()` it, and pass it to the agent. The
agent discovers the server's tools and surfaces them in the same event
stream as native tools.

## Over stdio

The agent spawns the MCP server as a child process. Useful for local
servers shipped alongside your app.

Source: [`examples/scripts/simple-mcp-stdio.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-mcp-stdio.ts)

```typescript
import { Agent, Instruct, MCP, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const wordCount = new MCP({
  transport: "stdio",
  command: "npx",
  args: ["tsx", "examples/mcps/wordcount-server.ts"],
});
await wordCount.connect();

const agent = new Agent({ provider, model, mcps: [wordCount] });

agent.on((event) => {
  if (event.type === "text:delta") process.stdout.write(event.delta);
  if (event.type === "part:start" && event.part.type === "action") {
    console.log(`\n[tool] ${event.part.detail.name}`);
  }
});

const result = await agent.send(
  new Instruct({
    prompt:
      "Tell me a 3-sentence story with a character's name, then report word and character counts.",
  }),
).final;
if (!result.ok) throw new Error(result.error.kind);

await wordCount.close();
```

## Over HTTP

Same setup, different transport. The MCP server needs to already be running
at the URL:

```bash
pnpm tsx examples/mcps/wordcount-server.ts --http --port 3100
```

Source: [`examples/scripts/simple-mcp-http.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-mcp-http.ts)

```typescript
const wordCount = new MCP({
  transport: "http",
  url: "http://localhost:3100/mcp",
});
await wordCount.connect();

// Rest is identical to the stdio example.
```

See the [MCP guide](/guide/mcp) for details on tool-name prefixing,
cancellation propagation, and lifecycle.
