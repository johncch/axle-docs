---
title: Streaming tool output
description: Live stdout/stderr from a local exec tool via action:progress events.
---

# Streaming tool output

A tool can stream progress chunks as it runs by calling `ctx.emit(chunk)`.
Listen for `action:progress` events to print each chunk in real time — handy
for long-running shell commands.

In 0.20.0 the built-in tools (including `execTool`) moved out of the core
`@fifthrevision/axle` package into the CLI. When using Axle as a library,
define your own exec tool:

Source: [`examples/scripts/simple-tool-stream.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-tool-stream.ts)

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";
import type { ExecutableTool } from "@fifthrevision/axle";
import { spawn } from "node:child_process";
import { z } from "zod";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const execSchema = z.object({
  command: z.string().describe("The shell command to execute"),
});

/**
 * A local exec tool that streams stdout/stderr chunks through tool progress
 * events via ctx.emit → action:progress.
 */
const execTool: ExecutableTool<typeof execSchema> = {
  name: "exec",
  description: "Execute a shell command and return stdout/stderr.",
  schema: execSchema,
  async execute({ command }, ctx) {
    return new Promise((resolve) => {
      const child = spawn(command, [], { shell: true });
      let output = "";

      child.stdout?.setEncoding("utf-8");
      child.stderr?.setEncoding("utf-8");
      child.stdout?.on("data", (chunk: string) => {
        output += chunk;
        ctx.emit(chunk);
      });
      child.stderr?.on("data", (chunk: string) => {
        output += chunk;
        ctx.emit(chunk);
      });
      child.on("close", (code) => {
        resolve(code === 0 ? output : `Command exited with code ${code}\n${output}`);
      });
    });
  },
};

const agent = new Agent({
  provider,
  model,
  tools: [execTool],
  system:
    "When the user asks you to do something, call the exec tool with an " +
    "appropriate shell command. After it completes, briefly summarize what happened.",
});

agent.on((event) => {
  switch (event.type) {
    case "action:running":
      console.log(`\n[exec] $ ${(event.parameters as { command?: string })?.command ?? ""}`);
      break;

    case "action:progress":
      // Live stdout/stderr chunks from the running subprocess.
      process.stdout.write(event.chunk);
      break;

    case "action:complete":
      if (event.result.type === "success") {
        console.log(`[exec] complete\n`);
      } else if (event.result.type === "error") {
        console.log(`[exec] error: ${event.result.error.message}\n`);
      }
      break;

    case "text:delta":
      process.stdout.write(event.delta);
      break;

    case "error":
      console.error(`\n[error] ${JSON.stringify(event.error, null, 2)}`);
      break;
  }
});

console.log("[Starting...]\n");

try {
  const result = await agent.send(
    "Run a shell command that prints 'step N' five times with a 0.5 second pause between each.",
  ).final;
  console.log(`\n\n[Usage] in: ${result.usage.in}, out: ${result.usage.out}`);
} catch (e) {
  console.error(e);
}

console.log("[Complete]");
```
