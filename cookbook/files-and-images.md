---
title: Files, images & PDFs
description: Attaching local files, URLs, tool-returned files, and deferred references.
---

# Files, images & PDFs

## A local image

```typescript
import { Agent, Instruct, loadFileContent, anthropic } from "@fifthrevision/axle";

const instruct = new Instruct({ prompt: "Describe this chart in one sentence." });
instruct.addFile(await loadFileContent("./chart.png"));

const agent = new Agent({ provider: anthropic(apiKey), model: "claude-sonnet-4-5" });
const result = await agent.send(instruct).final;
```

`loadFileContent` works out the kind from the MIME type and picks an encoding
for you — `utf-8` for text, `base64` for everything else. You can override it:

```typescript
await loadFileContent("./chart.png", "base64");
await loadFileContent("./notes.md", "utf-8");
```

It throws on files over 20 MiB, and on trying to read a binary file as text.

## A PDF

Exactly the same — documents are just another binary kind:

```typescript
instruct.addFile(await loadFileContent("./report.pdf"));
instruct.prompt = "Summarize the key findings in this report.";
```

Not every model accepts PDFs, though. Check `ModelInfo[model].multimodal`, and
prefer a model whose docs mention document support specifically.

## An image by URL

You can skip the download entirely and hand the provider a URL:

```typescript
instruct.addFile({
  kind: "image",
  mimeType: "image/png",
  name: "chart.png",
  source: { type: "url", url: "https://example.com/chart.png" },
});
```

The URL has to be reachable by the provider, not just by you. Providers also
differ on whether they'll fetch URLs at all, so base64 is the portable choice if
you need this to work everywhere.

## Inline text

A string, or a text file, becomes a `## Reference N` section in the message body
rather than a file part:

```typescript
instruct.addFile("Q3 revenue: $4.2M\nQ4 revenue: $5.1M", { name: "financials.csv" });
```

The content gets fenced, and the fence widens past any backticks inside it — so
markdown and code nest safely without you thinking about it.

## A tool that returns a file

```typescript
import { loadFileContent, type ExecutableTool } from "@fifthrevision/axle";
import * as z from "zod";

const showChart: ExecutableTool = {
  name: "show_chart",
  description: "Return a chart image for the given topic",
  schema: z.object({ topic: z.string() }),
  async execute({ topic }) {
    const image = await loadFileContent(`./charts/${topic}.png`, "base64");
    return [
      { type: "text", text: "Chart attached." },
      { type: "file", file: image },
    ];
  },
};
```

The model sees the image in the tool result and can describe it in the same send.

## Deferred references

Sometimes file content is expiring, access-controlled, or expensive to load. In
those cases you can store an opaque reference and resolve it only when a request
actually needs it — so nothing sensitive ends up sitting in your message history.

```typescript
import type { ExecutableTool, FileResolver } from "@fifthrevision/axle";

const readFile: ExecutableTool = {
  name: "read_file",
  description: "Read a file from the sandbox",
  schema: z.object({ id: z.string() }),
  async execute({ id }) {
    return [
      {
        type: "file",
        file: {
          kind: "text",
          mimeType: "text/plain",
          name: "result.txt",
          source: { type: "ref", ref: { id } }, // opaque — yours
        },
      },
    ];
  },
};

const fileResolver: FileResolver = async ({ ref, accepted, signal }) => {
  const { id } = ref as { id: string };
  await authorize(id); // the ref crossed a model boundary — re-check it

  if (!accepted.includes("text")) {
    throw new Error(`Text not accepted here: ${accepted.join(", ")}`);
  }
  return { type: "text", content: await sandbox.readText(id, { signal }) };
};

const agent = new Agent({ provider, model, tools: [readFile], fileResolver });
```

Three things to get right here:

- **Always check `accepted`.** It varies by provider, by model, and by whether
  the file is in a user message or a tool result. Returning a type that isn't
  accepted throws.
- **Authorize inside the resolver.** That ref travelled through the model, so
  treat it as untrusted input rather than as a capability. This is the security
  boundary.
- **Configure a resolver, or it throws.** A deferred file with none gives you
  `No fileResolver configured for deferred file: <name>`.

Set the resolver on `AgentConfig`, per send in `SendMessageOptions`, or on
`GenerateParams` / `StreamParams`. The per-send one wins.

## Rendering files in a UI

Files attached to a user turn arrive as `file` parts:

```typescript
case "file":
  return <FileChip name={part.file.name} kind={part.file.kind} />;
```

## See also

- [Instruct](/concepts/instruct)
- [Messages & parts reference](/reference/messages#files)
- [Tools](/concepts/tools)
