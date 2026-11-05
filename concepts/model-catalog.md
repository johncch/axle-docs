---
title: Model catalog & cost
description: Looking up a model's window, budgeting the context, and pricing a run against the models.dev catalog.
---

# Model catalog & cost

Axle ships no table of models. Model ids are plain strings your application
owns, and the runtime never needs to know what a model can do — see [no model
registry](/concepts/providers#no-model-registry) for why that stays true.

*You* sometimes need the facts anyway: how big is this model's window, what did
that run cost, does this one take attachments. The catalog is the opt-in data
layer for exactly those questions. It indexes [models.dev](https://models.dev),
you decide where the data lives, and nothing in Axle fetches it behind your
back.

::: warning Experimental
`ModelCatalog`, `ModelCatalogStore`, the catalog functions and `computeCost`
are marked `@experimental`: they are new in 0.35.0 and may change in a minor
release.
:::

## Four calls, each one yours

`ModelCatalogStore` holds the current catalog and moves it through its stages.
Every stage is a call you make — the store never touches storage, and nothing
refreshes on a timer.

```typescript
import { ModelCatalogStore, catalogFile } from "@fifthrevision/axle";

const file = catalogFile("./.cache/axle-models.json");
const catalogs = new ModelCatalogStore({ providers: ["anthropic", "openai"] });

catalogs.load(await file.read()); // the saved copy, if any — no network
const snapshot = await catalogs.refreshIfStale(); // JSON to save, or undefined
if (snapshot) await file.write(snapshot);

const catalog = catalogs.current; // ModelCatalog | undefined
```

- **`load(json)`** takes saved JSON text and ignores anything unusable —
  missing, corrupt, or written by an older Axle. It neither throws nor tells
  you; `current` just stays as it was, which on a cold start means `undefined`
  — a case every reader already handles.
- **`refresh()`** fetches models.dev with the current data's ETags and makes
  the result current. It resolves the JSON snapshot to save, or `undefined`
  when the fetch failed: it never rejects for the network. Calls that arrive
  while a refresh is in flight join it, so ten requests noticing a stale
  catalog make one fetch.
- **`refreshIfStale()`** is `refresh()` only when there is no data or it is
  older than `maxAge` (one day by default), and otherwise resolves `undefined`.
- **`snapshot()`** is the current data as JSON, whenever you want to write it.

`catalogFile(path)` is a file-backed `CatalogStorage` — `{ read, write }`, the
write atomic, a missing file reading as "none". It is a convenience, not a
requirement: the store speaks JSON text at both ends, so a database row or an
object store works the same way.

### Nothing has to block

`current` is `undefined` until a load or refresh gives it data, and every
reader has an answer for that case — an unknown window, an unpriced row. So a
server that must not wait reads the file, lets a refresh run, and gets on with
the request:

```typescript
catalogs.load(await file.read());
void catalogs.refreshIfStale().then(async (next) => {
  if (next) await file.write(next);
});
// catalogs.current is usable now; a refresh that lands replaces it
```

On a serverless host, invert it: a scheduled job calls `refresh()` and writes
the snapshot, and request handlers only ever `load()`.

## Asking the catalog something

`ModelCatalog` is synchronous and immutable. It never fetches — a new catalog
is how you get new data.

```typescript
catalog.lookup("claude-sonnet-5", { provider: "anthropic" });
// { id: "anthropic/claude-sonnet-5", match: "provider", model: {…}, cost: {…} }

catalog.contextWindow("claude-sonnet-5", { provider: "anthropic" });
// { window, id: "anthropic/claude-sonnet-5", match: "provider" }
```

`model` is a `CatalogModel`: `name`, `limit.context` / `limit.output`,
`reasoning`, `toolCall`, `structuredOutput`, `attachment`, `modalities` and the
`knowledge` cutoff — enough to answer "can this model take a PDF?" before you
send one. `cost` is per million tokens, as that provider charges it.

Both return `undefined` when nothing matches, and what to assume then is your
call. That's the one decision the catalog refuses to make for you.

### Two layers, and why a price needs a provider

The data has a canonical layer, keyed `publisher/model` and independent of who
serves the weights, and a provider layer, keyed by each provider's own ids with
that provider's limits and prices.

`lookup` tries them in order: the provider's own ids first when you pass a
`provider`, then the canonical key, then a best-effort match on the model's
name — the shape local runtimes hand you, with trailing build tags such as
`-mlx` or `:q8_0` dropped, punctuation and case ignored, and the publisher
ignored; an exact normalized match first, a unique prefix after. The result
says which route it took: `match` is `"provider"`, `"exact"` or `"prefix"`, and
`id` is what it landed on, so a guess is always visible as a guess.

Prices live in the provider layer because that is where they are real — the
same weights cost different amounts at Anthropic, at OpenRouter and on Bedrock.
A lookup without a `provider` still answers the window; it cannot answer the
price, and `cost` is simply absent.

The `provider` you pass is a models.dev provider id, which is exactly what
[`AIProvider.id`](/concepts/providers) already is: `anthropic`, `openai`,
`google` for Gemini, `openrouter`, `togetherai`, `amazon-bedrock` for
`bedrock()`. The same string is stamped on every usage row, so one id carries
from the provider you constructed through to the price.

## Budgeting the window

`agent.context()` estimates what the conversation currently occupies. The
catalog supplies the other half — what it is allowed to occupy:

```typescript
const limit = catalog?.contextWindow(model, { provider: provider.id })?.window;
const used = agent.context().total;
const share = limit ? used / limit : undefined; // 0…1, for a meter
```

Working one layer down, with no `Agent` to ask, estimate it yourself and hand
`estimateContextUsage` the same limit — then `limit` and `free` come back
filled in:

```typescript
import { estimateContextUsage } from "@fifthrevision/axle";

const limit = catalog?.contextWindow(model, { provider: provider.id })?.window;
const usage = estimateContextUsage({ system: agent.system, messages, tools, limit });
// { total, system, tools, mcpTools, providerTools, messages, limit, free }
```

`agent.context()` passes no limit of its own, so its result never carries
`limit` or `free`. The limit is data; the used side is an estimate, computed
locally from your messages and tool payloads — good enough for a compaction
threshold or a progress meter, not good enough for accounting. For real
numbers, read `result.usage` after a send.
[Compaction](/concepts/compaction) covers wiring a threshold to them.

## What a run cost

```typescript
import { computeCost } from "@fifthrevision/axle";

const result = await agent.send("Summarize the incident report").final;
if (result.ok) {
  const cost = computeCost(result.usage, catalog);
  // { usd, priced, unpriced, pricedWith? }
}
```

`computeCost` prices each row of `Stats.breakdown` separately — one row per
request, each carrying its own `provider`, `model` and `requestedModel`. Per
row is what makes the number right for a run that crossed models: a cheap one
summarizing for compaction, a subagent on another provider entirely. Within a
row, the price tier is chosen by that request's own input size, and cached,
cache-write and reasoning tokens are priced at their own rates wherever the
provider lists one.

It is synchronous and never throws. A row it cannot price lands in `unpriced`
with a reason, and the four reasons are worth knowing because each has a
different fix:

| `reason` | What happened | What to do about it |
| --- | --- | --- |
| `no-catalog` | you passed no catalog | load one |
| `no-provider` | the row has no provider id — a `chatCompletions()` pointed at a host Axle doesn't recognize | pass `id` when you construct the provider |
| `unlisted` | models.dev doesn't list that model under that provider | check the id you sent, or amend the data yourself |
| `no-price` | the provider lists the model but no price | nothing — it was free, or it's a local runtime and the price is yours to know |

`usd` sums `priced` only, so a partial answer is visibly partial: read
`unpriced.length` before you show a total as *the* total. `pricedWith` is the
`fetchedAt` of the catalog that priced the rows — the receipt for a number that
will be wrong next month.

`computeCost` is also exported from `@fifthrevision/axle/ui`, so a renderer can
price a `Stats` without pulling the provider SDKs into its bundle. The catalog
itself is only on the root entry point, so the usual split is to build it
server-side and send the `Cost` down.

## Writing your own data

`CatalogData` is plain JSON, version-stamped, and yours to amend: a negotiated
rate, a self-hosted model models.dev never heard of, a fixture that needs no
network.

```typescript
import { fetchModelsDev, ModelCatalog } from "@fifthrevision/axle";

const data = await fetchModelsDev({ providers: ["anthropic"] });
data.providers.anthropic["claude-sonnet-5"].cost = { input: 2.4, output: 12 };
const catalog = new ModelCatalog(data);
```

`new ModelCatalog(data)` takes its data as given, so read saved text with
`parseCatalogData` rather than `JSON.parse` — it validates the version and
shape and returns `undefined` when there is no usable copy, which means fetch.
`fetchModelsDev()` is the fetch on its own if you would rather not keep a
store: it resolves `CatalogData` or rejects with `CatalogFetchError`, never a
partial result, so the data you already had stays the best you have.

The `providers` filter is worth setting. The provider layer carries every
provider models.dev knows and is most of what you would save; naming the two or
three you actually use trims it. The filter is recorded as `coverage`, and a
`previous` fetched under a different filter is not reused for that layer.

## Next

- [Providers & models](/concepts/providers) — where `provider.id` comes from
- [Observability](/concepts/observability) — the `Stats` you are pricing
- [Compaction](/concepts/compaction) — spending the window you just measured
- [Providers reference](/reference/providers#model-catalog-and-cost) — every
  signature, option and type
