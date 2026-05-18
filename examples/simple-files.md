---
title: File references with a resolver
description: Attach files by opaque reference and resolve their bytes via fileResolver.
---

# File references with a resolver

Instead of inlining bytes, attach a file by a reference handle (`source: {
type: "ref", ref: "..." }`). The agent will call your `fileResolver` to
fetch the bytes when the provider needs them.

This is useful when:

- You don't want to read the file unless the model actually uses it.
- The bytes live behind auth (S3, blob store, internal API).
- You're caching/deduping by hash.

Source: [`examples/scripts/simple-files.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-files.ts)

```typescript
import { Agent, Instruct, loadFileContent, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

const instruct = new Instruct({ prompt: "What data is shown in the image?" });
instruct.addFile({
  kind: "image",
  mimeType: "image/png",
  name: "economist-brainy-imports.png",
  source: { type: "ref", ref: "key-1" },
});

const agent = new Agent({
  provider,
  model,
  fileResolver: async (params) => {
    // params.ref is "key-1" here. In real code, fetch from your store.
    const file = await loadFileContent(
      "./examples/data/economist-brainy-imports.png",
      "base64",
    );
    return { type: "base64", data: file.source.data };
  },
});

const result = await agent.send(instruct).final;
if (!result.ok) throw new Error(result.error.kind);
console.log(result.response);
```
