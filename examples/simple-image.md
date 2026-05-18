---
title: Local image file
description: Attach an image from disk to an Instruct.
---

# Local image file

Use `loadFileContent` to read an image off disk, then `addFile` it to the
`Instruct`. The provider receives the bytes inline.

Source: [`examples/scripts/simple-image.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-image.ts)

```typescript
import { Agent, Instruct, loadFileContent, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

async function analyzeImage() {
  const imageFile = await loadFileContent("./examples/data/economist-brainy-imports.png");

  const instruct = new Instruct({ prompt: "What are the data that is shown in the image." });
  instruct.addFile(imageFile);

  const agent = new Agent({ provider, model });
  const result = await agent.send(instruct).final;

  console.log(result.response);
}

analyzeImage();
```
