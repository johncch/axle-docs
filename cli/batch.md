---
title: Batch
description: Run the same task across multiple files.
---

# Batch

Add a `batch` key to the job file to run the same task across multiple files.
Each matched file is attached to the instruct automatically.

```yaml
# axle.job.yaml
provider:
  type: openai

task: |
  Summarize this file.

batch:
  files: "./data/*.txt"
  concurrency: 3
  resume: true
```

## Options

| Field         | Description                                                                |
| ------------- | -------------------------------------------------------------------------- |
| `files`       | Glob pattern for input files.                                              |
| `concurrency` | Max parallel runs (default `3`).                                           |
| `resume`      | Skip files already processed in a previous run.                            |

## Outputs

Each run writes its output to the configured output directory, named after
the input file. With `resume: true`, the CLI checks the output directory
before queueing each input, so interrupted batches pick up where they left
off.

## Tips

- Keep `concurrency` low for rate-limited providers.
- Use `--debug` when iterating on the prompt; switch back when running over
  large file sets.
