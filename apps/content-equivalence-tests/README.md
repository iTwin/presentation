# Presentation content equivalence tests

This private app compares descriptors and sampled raw values produced by the
legacy `@itwin/presentation-backend` content API and the new
`@itwin/presentation-content` pipeline.

The suite reads iModels from a runtime JSON manifest. It stores each
implementation's captures independently, allowing changes to the new content
package to be compared repeatedly against unchanged legacy output.

## Configure

Copy `imodels.example.json` to `imodels.json`:

```json
{
  "$schema": "./imodels.schema.json",
  "sampling": {
    "perClass": 5,
    "seed": 1535
  },
  "imodels": [
    {
      "name": "building",
      "path": "./models/building.bim"
    }
  ]
}
```

The `$schema` reference enables editor completion and validation using
[`imodels.schema.json`](./imodels.schema.json). The schema rejects unknown
properties. The runtime loader also checks that files exist and that iModel names
and resolved paths are unique; JSON Schema cannot enforce these checks.

Relative iModel paths are resolved from the manifest directory. Each iModel may
also contain an `instanceKeys` array:

```json
{
  "$schema": "./imodels.schema.json",
  "sampling": {
    "perClass": 5,
    "seed": 1535
  },
  "imodels": [
    {
      "name": "building",
      "path": "./models/building.bim",
      "instanceKeys": [
        {
          "className": "MySchema.MyElement",
          "id": "0x123"
        },
        {
          "className": "MySchema.AnotherElement",
          "id": "0x456"
        }
      ]
    }
  ]
}
```

Explicit keys are added to the deterministic per-class sample.

Keep iModels on a local disk. The new implementation's ECSQL requests have a
60-second time quota. On slow storage, such as Windows drives mounted in WSL
(`/mnt/c`, `/mnt/e`), large iModels exceed it. Requests then fail with
`query too long to execute or server is too busy`.

## Run

From this directory:

```sh
pnpm test
```

Each iModel runs as a separate, sequential test with no Vitest test timeout;
scenarios have their own time limit, described below. The verbose reporter shows
per-iModel progress and results. A failing iModel does not prevent the remaining
iModels from running.

Timestamped logs identify the iModel, scenario, and implementation being processed.
They show whether samples and captures are reused from cache or generated, when
normalization and comparison begin, difference counts, and report locations.

To run a specific iModel, filter by its name:

```sh
pnpm test -t building
```

`CONTENT_EQUIVALENCE_MANIFEST` selects a different manifest file. It defaults to
`./imodels.json`. Captures are keyed by iModel content, so a manifest pointing
at copies of the same iModels reuses their cached captures.

`CONTENT_EQUIVALENCE_OUTPUT` changes the output directory. It defaults to
`./output`.

`CONTENT_EQUIVALENCE_SCENARIO_TIMEOUT_MINUTES` sets a time limit, in minutes,
for each scenario. It defaults to `30`, and `0` disables it. When the limit is
reached, the scenario fails and running ECSQL queries of the new implementation
are canceled. The runner waits for that work to stop before closing the iModel
and moving on. When a capture fails, queries it left running are canceled the
same way. Legacy content requests can't be canceled, so the runner waits for
them to finish.

`CONTENT_EQUIVALENCE_REFRESH` controls capture regeneration:

- `none` (default): reuse all valid captures.
- `legacy`: regenerate only legacy captures.
- `new`: regenerate only new-generation captures.
- `all`: regenerate both.

For example, after changing `@itwin/presentation-content`:

```sh
CONTENT_EQUIVALENCE_REFRESH=new \
pnpm test
```

The new implementation fingerprint includes the content package's TypeScript
sources, so changing that package also invalidates only new captures
automatically. Changes to normalization and comparison code reuse both captures.

## Outputs

`output/cache` contains reusable, lossless captures keyed by:

- iModel content hash;
- scenario and sampled keys;
- implementation-specific fingerprint;
- capture format version.

Sampling results are cached separately by iModel and sampling configuration.
Cache paths use labeled, 12-character fingerprint prefixes, for example:

```text
output/cache/imodel-a7d50df05561/new/implementation-9eef3e4e537b/sampled-elements-8040d131b939.json
output/cache/imodel-a7d50df05561/sampling/sampling-053e9ed8114f.json
```

The capture files retain complete fingerprints and validate them when loaded.

`output/runs` contains one timestamped report directory per test run, shared by all
iModel tests:

```text
output/runs/<timestamp>-<process id>/
  run.json
  summary.json
  <iModel name>/
    sample.json
    all-elements-descriptor/
    sampled-elements/
```

The run directory contains:

- `run.json`: run configuration and implementation fingerprints;
- `summary.json`: per-scenario results and execution errors, updated after each
  iModel.

Each iModel directory contains:

- `sample.json`: sampled keys and candidate counts;
- `sampling-error.json`: the sampling error, if sampling fails. The `sampled-elements` scenario is then skipped;
- `error.json`: the error, if the iModel can't be processed at all, for example when its file can't be read.

Each scenario directory contains:

- `legacy.normalized.json` and `new.normalized.json`: normalized descriptors and
  values;
- `differences.json`: structured descriptor and value differences;
- `captures.json`: capture paths and cache-hit status;
- `error.json`: the error, if the scenario fails;
- `<implementation>.diagnostics.json`: implementation-specific details about
  captures generated in the run. `new.diagnostics.json` lists failed, canceled,
  abandoned, and still-running ECSQL queries, plus the slowest ones, with phase,
  timing, row count, and a query hash for grouping the same query across iModels.
  Known failures the pipeline handles itself, such as checks for embedded
  presentation rulesets in iModels without them, are only counted.

Captures are written atomically. Incomplete generation is not reusable. Invalid
cache files are reported and regenerated.

The command exits unsuccessfully when any scenario has differences or an
implementation fails. Independent models and scenarios continue so one run
collects all available diagnostics.
