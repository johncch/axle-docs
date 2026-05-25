---
title: CLI Overview
description: Run Axle jobs from a declarative YAML config.
---

# CLI Overview

In accordance with Axle's lineage as a workflow tool, Axle exposes a command
line interface that accepts a declarative YAML job file.

## Installation

```bash
npm install -g @fifthrevision/axle-cli
```

## Usage

Pass a job file with the `-j` flag:

```bash
axle -j path/to/job.yml
axle -j path/to/job.yaml --args key=value other=thing
axle -j path/to/job.yml --debug
```

An explicit `-j` flag is required. Default config file lookup
(`axle.job.yaml`, `axle.config.yaml`) and JSON job files are no longer
supported. Only `.yml` and `.yaml` job files are accepted.

## Job file

A job file specifies the provider, task prompt, and optional tools/files:

```yaml
# axle.job.yml
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
axle -j job.yml --args topic="quarterly results" audience="executive"
```

```yaml
task: |
  Summarize the {{topic}} for an {{audience}} reader.
```

## Where to next

- [Batch](/cli/batch) — run the same task across many files.
- [MCP Servers](/cli/mcp) — wire MCP servers into a job.
- [Configuration](/cli/configuration) — API keys and provider defaults.
