---
title: Messages & parts
description: The wire format — AxleMessage, content parts, files, and citations.
---

# Messages & parts

The model-facing conversation format. You'll need these types when you're reading `agent.messages`, writing a
[compactor](/concepts/compaction), or calling
[`generate()` / `stream()`](/reference/generate-stream) directly. Otherwise you
can happily ignore them.

Conceptual guide: [Anatomy of a send](/concepts/anatomy-of-a-send#message-the-wire-lens).

## AxleMessage

```typescript
type AxleMessage = AxleUserMessage | AxleAssistantMessage | AxleToolCallMessage;
```

```typescript
interface AxleUserMessage {
  role: "user";
  id?: string;
  name?: string;
  content: string | ContentPart[];
  metadata?: MessageMetadata;
}

interface AxleAssistantMessage {
  role: "assistant";
  id: string;
  model?: string;
  content: Array<
    ContentPartText | ContentPartThinking | ContentPartToolCall
    | ContentPartProviderTool | ContentPartCitation
  >;
  finishReason?: AxleStopReason;
}

interface AxleToolCallMessage {
  role: "tool";
  id: string;
  content: AxleToolCallResult[];
}

interface AxleToolCallResult {
  id: string; // the tool call id this answers
  name: string;
  content: string | ToolResultPart[];
  isError?: boolean;
}
```

`MessageMetadata` is `Record<string, unknown>`. Providers ignore it; it exists so
hosts can carry presentation hints through history and into turns.

## Content parts

```typescript
type ContentPart =
  | ContentPartText
  | ContentPartFile
  | ContentPartToolCall
  | ContentPartThinking
  | ContentPartProviderTool
  | ContentPartCitation;
```

| Part | Fields |
| --- | --- |
| `ContentPartText` | `type: "text"`, `text`, `citations?`, `providerMetadata?` |
| `ContentPartFile` | `type: "file"`, `file: FileInfo` |
| `ContentPartThinking` | `type: "thinking"`, `id?`, `text?`, `summary?`, `redacted?`, `continuity?`, `providerMetadata?` |
| `ContentPartToolCall` | `type: "tool-call"`, `id`, `name`, `parameters`, `providerMetadata?` |
| `ContentPartProviderTool` | `type: "provider-tool"`, `id`, `name`, `input?`, `output?` |
| `ContentPartCitation` | `type: "citation"`, `citations`, `providerMetadata?` |

### ThinkingContinuity

```typescript
type ThinkingContinuity =
  | { provider: "openai"; encrypted: string }
  | { provider: "anthropic"; signature?: string; redactedData?: string }
  | { provider: "gemini"; thoughtSignature: string };
```

Opaque provider state that lets a model continue reasoning across requests.
Preserve it verbatim through storage and restoration — strip it and multi-turn
reasoning breaks.

## Files

```typescript
type FileKind = "image" | "document" | "text";

type FileInfo = TextFileInfo | BinaryFileInfo;

type TextFileInfo = {
  kind: "text";
  mimeType: string;
  name: string;
  size?: number;
  source: { type: "text"; content: string } | { type: "url"; url: string } | { type: "ref"; ref: unknown };
};

type BinaryFileInfo = {
  kind: "image" | "document";
  mimeType: string;
  name: string;
  size?: number;
  source: { type: "base64"; data: string } | { type: "url"; url: string } | { type: "ref"; ref: unknown };
};
```

### loadFileContent()

```typescript
loadFileContent(filePath: string): Promise<FileInfo>
loadFileContent(filePath: string, encoding: "utf-8"): Promise<InlineTextFile>
loadFileContent(filePath: string, encoding: "base64"): Promise<InlineBinaryFile>
```

Encoding defaults to `utf-8` for text files and `base64` for everything else.
Throws on a missing file, on files over 20 MiB, and when reading a non-text file
as text.

### Deferred references

A `{ type: "ref" }` source is host-owned and resolved only when a provider
request needs it — useful for expiring URLs and access-controlled content, which
should not be persisted in history.

```typescript
type FileResolver = (request: FileResolveRequest) => Promise<ResolvedFileSource>;

interface FileResolveRequest {
  file: DeferredFileInfo;
  ref: unknown;
  provider: FileProviderId; // "anthropic" | "openai" | "gemini" | "chatcompletions"
  model: string;
  accepted: FileResolveFormat[]; // "base64" | "url" | "text" | "gemini-file-uri"
  signal?: AbortSignal;
}

type ResolvedFileSource =
  | { type: "base64"; data: string; mimeType?: string; name?: string }
  | { type: "url"; url: string; mimeType?: string; name?: string }
  | { type: "text"; content: string; mimeType?: string; name?: string }
  | { type: "gemini-file-uri"; uri: string; mimeType?: string; name?: string };
```

Return a source whose `type` appears in `accepted`, or Axle throws. `mimeType`
and `name` fall back to the file's own values if you omit them.

A deferred file with no resolver configured throws
`No fileResolver configured for deferred file: <name>`.

Set a resolver on `AgentConfig`, per send in `SendMessageOptions`, or on
`GenerateParams` / `StreamParams`.

## Citations

```typescript
interface Citation {
  source: CitationSource;
  outputSpan?: { start?: number; end?: number };
  providerMetadata?: Record<string, unknown>;
}

type CitationSource =
  | { type: "web"; title?: string; url: string; citedText?: string }
  | { type: "document"; title?: string; fileId?: string; citedText?: string; locator?: DocumentLocator }
  | { type: "search-result"; title?: string; url?: string; citedText?: string; locator?: DocumentLocator }
  | { type: "retrieved-context"; title?: string; uri?: string; citedText?: string; locator?: DocumentLocator }
  | { type: "unknown"; citedText?: string };

type DocumentLocator =
  | { type: "char"; start?: number; end?: number }
  | { type: "page"; start?: number; end?: number }
  | { type: "block"; start?: number; end?: number }
  | { type: "part"; index?: number };
```

`outputSpan` gives you offsets into the generated text — that's how you underline
the cited span in a UI. Text-anchored citations live on
`ContentPartText.citations`; provider-emitted source lists arrive as their own
`ContentPartCitation`.

## Usage

```typescript
interface TokenStats {
  in: number; // effective input; includes cachedIn and cacheWriteIn
  out: number; // includes reasoningOut
  cachedIn?: number;
  cacheWriteIn?: number;
  reasoningOut?: number;
}

interface UsageEntry extends TokenStats {
  provider: string;
  model: string;
}

interface Stats extends TokenStats {
  breakdown?: UsageEntry[]; // @experimental
}
```

`breakdown` entries **explain** the aggregate rather than adding to it, so don't
sum them on top.

Helpers: `createStats()`, `addStats(target, source)`, `mergeStats(...)`.

## Compaction helpers

```typescript
getCompactionStamp(message: AxleMessage): CompactionStamp | undefined
validateCompactedMessages(messages: AxleMessage[]): void

interface CompactionStamp {
  id: string;
  role: "summary" | "appendix";
}
```

The stamp lives under `metadata.axleCompaction`, on **user** messages only. The
engine never reads it — it's purely a compactor-side convention for recognizing
your own prior output. See [Compaction](/concepts/compaction#recognizing-your-own-output).

`validateCompactedMessages` throws `AxleError` with code
`COMPACTION_INVALID_MESSAGES` when tool calls and results are not correctly
paired and adjacent.
