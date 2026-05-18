---
title: Tool that returns a file
description: A tool can return mixed content — text plus a file the model can then "see".
---

# Tool that returns a file

A tool's `execute` can return an array of content parts. Mix text and file
parts, and the file shows up in the model's next view as if it had been
attached to the conversation.

Source: [`examples/scripts/simple-tool-with-file.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-tool-with-file.ts)

```typescript
import { z } from "zod";
import { Agent, Instruct, loadFileContent, anthropic } from "@fifthrevision/axle";
import type { ExecutableTool } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const showChartTool: ExecutableTool = {
  name: "show_chart",
  description: "Returns a chart image for the given topic.",
  schema: z.object({ topic: z.string() }),
  async execute() {
    const image = await loadFileContent("./examples/data/economist-brainy-imports.png", "base64");
    return [
      { type: "text", text: "Chart attached." },
      { type: "file", file: image },
    ];
  },
};

async function run() {
  const instruct = new Instruct({
    prompt:
      "Use the show_chart tool with topic 'imports', then describe what the chart shows in one sentence.",
  });

  const agent = new Agent({ provider, model, tools: [showChartTool] });
  const result = await agent.send(instruct).final;

  console.log(result.response);
}

run();
```
