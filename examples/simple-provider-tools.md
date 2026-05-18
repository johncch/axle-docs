---
title: Provider tools (web search)
description: Use a provider-side tool like web search via providerTools.
---

# Provider tools

Provider tools run on the LLM provider's side — web search, code
interpreter, and so on. Declare them with
`{ type: "provider", name: "web_search" }`; Axle maps the common names to
the right provider-specific identifier.

Source: [`examples/scripts/simple-provider-tools.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-provider-tools.ts)

```typescript
import { Agent, anthropic } from "@fifthrevision/axle";
import type { ProviderTool } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const webSearch: ProviderTool = { type: "provider", name: "web_search" };

const agent = new Agent({ provider, model, providerTools: [webSearch] });

agent.on((event) => {
  switch (event.type) {
    case "part:start":
      if (event.part.type === "text") {
        console.log(`\n[Text] started`);
      } else if (event.part.type === "action" && event.part.kind === "provider-tool") {
        console.log(`\n[Provider Tool] ${event.part.detail.name} started`);
      }
      break;
    case "text:delta":
      process.stdout.write(event.delta);
      break;
    case "action:complete":
      console.log(`[Provider Tool] complete ${JSON.stringify(event.result)}`);
      break;
    case "error":
      console.error(`[Error] ${JSON.stringify(event.error, null, 2)}`);
      break;
  }
});

console.log("[Starting...]");

try {
  const result = await agent.send("What are today's top news headlines?").final;
  console.log(`\n[Usage] in: ${result.usage.in}, out: ${result.usage.out}`);
} catch (e) {
  console.error(e);
}

console.log("[Complete]");
```
