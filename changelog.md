---
title: Changelog
description: Notable changes by release.
---

# Changelog

## [0.25.5] - 2026-07-03

- Added Claude Fable 5 and Claude Sonnet 5 models (`claude-fable-5`, `claude-sonnet-5`) with 128K output token support.
- Added Gemini 3.5 Pro model (`gemini-3.5-pro`).

## [0.25.4] - 2026-06-17

- Improved `parallelize` handling for more reliable batched tool execution, including a new `maxResultBytes` option (defaults to 20 MiB) to cap the total byte size returned from one batch.

## [0.25.3] - 2026-06-16

- Fixed OpenAI file handling so filenames and URLs are resolved correctly.

## [0.25.2] - 2026-06-15

- Fixed tool calls with syntactically invalid JSON parameters so they are handled gracefully instead of failing — Axle now surfaces them as tool-call argument errors via stream events rather than throwing.

## [0.25.1] - 2026-06-13

- Consolidated Chat Completions vendor options. The `providerToolVendor` option on the `chatCompletions` provider is renamed to `vendor`, and Axle now auto-detects the vendor from the base URL for OpenRouter and Together.

## [0.25.0] - 2026-06-12

- Added a web search fallback via `configureAxle({ webSearchFallback })`. When a provider does not natively support `web_search`, Axle can execute web search on its own using a configured backend (e.g., Brave). The `braveWebSearch()` helper builds a Brave Search LLM-context backend.
- Added `AxleConfiguration` with `configureAxle()` / `getAxleConfiguration()` for library-wide settings.
- Improved handling of non-text tool results — unsupported file parts in Chat Completions tool results now produce a descriptive placeholder instead of throwing.
- Added Together vendor support to the Chat Completions provider, with auto-detection from the Together API hostname and proper reasoning translation.

## [0.24.0] - 2026-06-11

- Added experimental sub-agent tools (`createAgentTool`) for delegating bounded work to other agents.
- Added experimental parallel tool execution (`parallelize`) for running batched tool calls concurrently.
- Added tool context helpers: `ctx.reportUsage` for reporting usage and a flat per-provider/model `Stats.breakdown` for cost reconstruction.
- Added child turn-event forwarding for sub-agent tools (`action:child-event`, rendered as agent action parts).
- Added `tool:exec-error` stream event for fatal/aborted tool calls.
- In `stream()`, a user-provided `onToolCall` returning `null`/`undefined` now falls through to executing the matching registry tool (matching `generate()`'s existing semantics) instead of producing a `not-found` result.
- A tool throwing an error merely named `AbortError` (e.g. an internal fetch timeout) while the run's signal is live is now reported to the model as an ordinary tool error instead of aborting the run.
- Improved streaming/tool-call behavior and error reporting.
- Fixed output fencing in generated content.

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
