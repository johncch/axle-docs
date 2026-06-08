---
title: Changelog
description: Notable changes by release.
---

# Changelog

## [0.23.1] - 2026-06-08

- Updated Anthropic thinking configuration — Claude 4.6+ (Opus 4.6+, Sonnet 4.6+) models use Anthropic's adaptive thinking mode with effort-based control instead of a fixed token budget

## [0.23.0] - 2026-06-08

- Reworked observability around a unified `observability.trace` seam: pass a `Tracer` for root-level tracing or a `Span` to nest agent runs under an existing span
- Renamed `TracingContext` → `Span`, `ToolContext.tracer` → `ToolContext.span`, and the threaded `tracer` parameter to `span` across `generate()`, `stream()`, MCP, and tool calls
- `log` and `trace` are now mutually exclusive on observability config; compose writers on one `Tracer` for multiple sinks (`LogWriter` is exported)
- `Tracer` constructor now accepts `{ minLevel, writers }` options bag
- `SpanData` timestamps are now epoch milliseconds (previously monotonic from `performance.now()`)
- Turn content logging is now consistent across streaming and non-streaming paths
- Added `LogWriter` export for composing writers
- See the [0.23.0 migration guide](/migration/0.23.0) for full details

## [0.22.1] - 2026-06-07

- Improved handling of chat-completions streaming errors — stream chunks with `error` fields are now surfaced as error events instead of crashing the parser
- Fixed incomplete tool-call buffering: when a stream ends without a completion signal while tool-call arguments are still buffering, Axle now emits an `IncompleteStream` error event instead of silently dropping the truncated arguments
- Fixed Gemini citation handling — citations without a resolvable text part are now logged and skipped, instead of silently attaching to the wrong part

## [0.22.0] - 2026-06-06

- Added `CitationPart` — an ordered, unanchored citation part for providers that emit source lists for the whole message rather than per text-span (e.g. OpenRouter web search)
- Added OpenRouter server tool support to the Chat Completions provider via `providerToolVendor: "openrouter"` — maps `providerTools` to OpenRouter's `openrouter:web_search` format
- Added `citation` stream event for low-level consumers of unanchored provider citations
- Added diagnostic `console.warn` when native providers emit citation data outside expected text-anchored positions
- Fixed interweaving tool handling in streaming responses
- See the [0.22.0 migration guide](/migration/0.22.0) for full details

## [0.21.0] - 2026-05-30

- Added citations support on text parts (`TextPart.citations`, `text:citation` events)
- Added richer thinking/reasoning formats: optional `text`, provider summaries, redaction, and `continuity` for multi-turn state
- Added new turn events: `text:citation`, `thinking:summary-delta`, `thinking:update`
- Added `metadata` option to `agent.send()` and `Instruct` for stable host-owned user-turn data
- Added `Agent` constructor shortcut for session rehydration: `new Agent(config, session)`
- Added portable `maxRetries` and `timeoutMs` options to all provider factories
- Added `CLAUDE_OPUS_4_8` model constant
- Updated Gemini default model to `gemini-3.5-flash` (was `gemini-3.1-flash-lite`)
- See the [0.21.0 migration guide](/migration/0.21.0) for full details

## [0.20.0] - 2026-05-25

- Split the library and CLI into separate packages: `@fifthrevision/axle` (library) and `@fifthrevision/axle-cli` (CLI)
- The `axle` binary is no longer published by the core package; install `@fifthrevision/axle-cli` globally
- Built-in local tools (`calculatorTool`, `execTool`, `readFileTool`, `writeFileTool`, `patchFileTool`) and `braveSearchTool` removed from the core package; define tools directly in application code or use CLI job files
- `ProceduralMemory` and `LocalFileStore` moved to the CLI package; core now exports only the `AgentMemory` and `FileStore` interfaces
- Added `AgentDefinition`, `AgentSession`, `SavedAgent` for serializable agent save/resume
- Added `createAgentConfig(definition, resolver)` for constructing runtime config from a serializable definition
- Added `agent.snapshot()` and `agent.restore(session)` for session continuation
- CLI no longer loads `axle.config.yml`/`axle.config.yaml` or JSON config files; credentials come from environment variables or a local `.env` file
- CLI now requires an explicit `-j path/to/job.yml` flag; default job file lookup removed
- See the [0.20.0 migration guide](/migration/0.20.0) for full details

## [0.19.0] - 2026-05-24

- Added a browser-only export for client-side bundles that omits server-only code
- Added annotations support to Turns; see the [0.19.0 migration guide](/migration/0.19.0) for details

## [0.18.0] - 2026-05-22

- Added support for Gemini 3.5 Flash
- Standardized request options across providers, including output tokens, temperature, top-p, stop sequences, tool choice, and provider-specific options
- Renamed provider option types and runtime parameters; see the [0.18.0 migration guide](/migration/0.18.0) for update details
- Updated usage stats to include cached tokens and thinking tokens
- Added a simple context counter (`agent.context()`) and split MCP tools for more flexible tool usage
- Fixed bugs found during smoke testing

## [0.17.0] - 2026-05-13

- Updated the Instruct constructor to use object-style options
- Improved Instruct schema typing to support any Zod schema
- Added clearer errors for missing template variables
- Improved result ergonomics for easier handling by applications

## [0.16.3] - 2026-05-13

- Added vars mode to Instruct for easier variable-based prompting
- Fixed bugs found through live provider testing

## [0.16.2] - 2026-05-11

- Fixed OpenAI and Chat Completions providers: `reasoning: false` now sends no reasoning effort instead of minimal reasoning

## [0.16.1] - 2026-05-11

- Added `z.enum` and `z.literal` support to Instruct structured-output schemas

## [0.16.0] - 2026-05-11

- Added `instruct` support to generate and stream APIs for supplying structured instructions directly
- Updated structured output instructions to use JSON for more reliable parsing
- Added open-weight model options
- Improved cancellation behavior by propagating abort signals through MCP tool calls

## [0.15.1] - 2026-05-08

- Added `AxleToolFatalError` for fatal tool failures, allowing generation, streaming, and agent runs to stop immediately without retrying or exposing the error to the model
- Fatal tool errors now preserve available partial output, messages, usage, and tool context for easier handling by applications

## [0.15.0] - 2026-05-08
