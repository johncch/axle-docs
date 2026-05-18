---
title: MCP Servers
description: Wire MCP servers into a CLI job.
---

# MCP Servers

Add an `mcps` key to connect to MCP servers. Both stdio and HTTP transports
are supported.

```yaml
# axle.job.yaml
provider:
  type: anthropic

mcps:
  - name: wc
    transport: stdio
    command: npx
    args: ["tsx", "examples/mcps/wordcount-server.ts"]
  - transport: http
    url: http://localhost:3100/mcp

task: |
  Count the words in "hello world"
```

## Fields

| Field                | Used by | Description                                              |
| -------------------- | ------- | -------------------------------------------------------- |
| `transport`          | both    | `"stdio"` or `"http"` (required).                        |
| `name`               | both    | Prefix for tool names from this server (optional).       |
| `command`            | stdio   | Executable to launch the MCP server.                     |
| `args`               | stdio   | Arguments passed to the command.                         |
| `env`                | stdio   | Environment variables for the spawned process.           |
| `url`                | http    | MCP HTTP endpoint.                                       |
| `headers`            | http    | Additional headers (e.g. auth).                          |

See the [library MCP guide](/guide/mcp) for behavioral details — name
prefixing, cancellation propagation, and lifecycle.
