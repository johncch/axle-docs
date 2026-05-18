---
title: CLI Overview
description: Run Axle jobs from a declarative YAML config.
---

# CLI Overview

In accordance with Axle's lineage as a workflow tool, Axle exposes a command
line interface that accepts a declarative config file.

## Installation

```bash
npm install -g @fifthrevision/axle
```

## Usage

The CLI looks for `axle.job.yaml` and `axle.config.yaml` in the current
directory by default. You can also specify them using the `-j` and `-c`
flags.

```bash
axle
axle -j path/to/job.yaml -c path/to/config.yaml
axle --args key=value other=thing
axle --debug
```

## Job file

A job file specifies the provider, task prompt, and optional tools/files:

```yaml
# axle.job.yaml
provider:
  type: anthropic
  model: claude-sonnet-4-5-20250929

task: |
  Summarize the attached document.

tools:
  - calculator

provider_tools:
  - web_search

files:
  - ./data/report.txt
```

## Arguments

Pass `--args key=value` to set template variables consumed by `task`. Inside
`task`, use `{{key}}` placeholders.

```bash
axle --args topic="quarterly results" audience="executive"
```

```yaml
task: |
  Summarize the {{topic}} for an {{audience}} reader.
```

## Where to next

- [Batch](/cli/batch) — run the same task across many files.
- [MCP Servers](/cli/mcp) — wire MCP servers into a job.
- [Configuration](/cli/configuration) — API keys and provider defaults.
