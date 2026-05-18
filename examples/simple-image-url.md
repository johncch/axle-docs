---
title: Image by URL
description: Reference an image by URL instead of uploading bytes.
---

# Image by URL

Skip the file load — pass `{ source: { type: "url", url: "..." } }` and the
provider fetches it.

Source: [`examples/scripts/simple-image-url.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-image-url.ts)

```typescript
import { Agent, Instruct, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const IMAGE_URL = "https://images-assets.nasa.gov/image/as17-148-22727/as17-148-22727~orig.jpg";

async function describeImageByUrl() {
  const instruct = new Instruct({ prompt: "In one sentence, what is shown in this image?" });
  instruct.addFile({
    kind: "image",
    mimeType: "image/jpeg",
    name: "earth-apollo-17.jpg",
    source: { type: "url", url: IMAGE_URL },
  });

  const agent = new Agent({ provider, model });
  const result = await agent.send(instruct).final;

  console.log(result.response);
}

describeImageByUrl();
```
