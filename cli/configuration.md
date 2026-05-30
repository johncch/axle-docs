---
title: Configuration
description: Configure API keys and provider defaults for the CLI.
---

# Configuration

The CLI reads provider credentials from environment variables or a local
`.env` file in your working directory. There is no `axle.config.yaml` or
other config file.

## Environment variables

```bash
# Provider API keys
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...

# Optional model overrides
OPENAI_MODEL=gpt-5-mini
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
GEMINI_MODEL=gemini-3.5-flash

# OpenAI-compatible endpoints (Ollama, vLLM, etc.)
CHATCOMPLETIONS_BASE_URL=http://localhost:11434/v1
CHATCOMPLETIONS_MODEL=llama3
CHATCOMPLETIONS_API_KEY=...   # optional
```

Place these in a `.env` file alongside your job files and the CLI will load
them automatically. Keep `.env` out of source control.

## Per-job overrides

Provider-level fields in the job file override environment defaults:

```yaml
provider:
  type: openai
  model: gpt-5-mini
```

To use a non-standard environment variable for an API key, use `apiKeyEnv`:

```yaml
provider:
  type: openai
  apiKeyEnv: CUSTOM_OPENAI_KEY
```

### Retry and timeout

Provider config also accepts `maxRetries` and `timeoutMs` for reliability
tuning:

```yaml
provider:
  type: anthropic
  model: claude-sonnet-4-5-20250929
  maxRetries: 2
  timeoutMs: 30000
```

- `maxRetries` — number of retry attempts after the first request (`0` disables retries).
- `timeoutMs` — request timeout in milliseconds.

## CI/CD

In CI, set the environment variables directly in your pipeline secrets. No
config file is required — the CLI picks them up automatically.
