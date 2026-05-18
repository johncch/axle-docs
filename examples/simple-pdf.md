---
title: PDF file
description: Attach a PDF to an Instruct and ask for a summary.
---

# PDF file

`loadFileContent` detects the PDF MIME type from the extension and the
provider handles the document end-to-end.

Source: [`examples/scripts/simple-pdf.ts`](https://github.com/johncch/axle/blob/main/examples/scripts/simple-pdf.ts)

```typescript
import { Agent, Instruct, loadFileContent, anthropic } from "@fifthrevision/axle";

const provider = anthropic(process.env.ANTHROPIC_API_KEY!);
const model = "claude-sonnet-4-5-20250929";

async function summarizePdf() {
  const pdf = await loadFileContent("./examples/data/designing-a-new-foundation.pdf");

  const instruct = new Instruct({ prompt: "Summarize this document in 2-3 sentences." });
  instruct.addFile(pdf);

  const agent = new Agent({ provider, model });
  const result = await agent.send(instruct).final;

  console.log(result.response);
}

summarizePdf();
```
