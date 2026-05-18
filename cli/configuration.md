---
title: Configuration
description: Configure API keys and provider defaults for the CLI.
---

# Configuration

For CLI use, create an `axle.config.yaml` in your working directory with API
keys:

```yaml
# axle.config.yaml
openai:
  api-key: "<api-key>"
anthropic:
  api-key: "<api-key>"
gemini:
  api-key: "<api-key>"
chatcompletions:
  base-url: "http://localhost:11434/v1"
  model: "llama3"
  api-key: "<api-key>" # optional
```

## Overrides

Provider-level keys in the job file override the config file. For example,
specifying `provider.model` in `axle.job.yaml` overrides any default model
from `axle.config.yaml`.

## Recommended setup

- Keep `axle.config.yaml` outside source control. Treat it like an `.env`
  file.
- Use environment variables (e.g. `ANTHROPIC_API_KEY`) for CI by passing
  them through `axle.config.yaml` via templating in your deploy step, or by
  using the library API directly.

## Locating config

By default the CLI searches the current directory. Use `-c
path/to/config.yaml` to point at a specific config file.
