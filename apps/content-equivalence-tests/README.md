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

Relative iModel paths are resolved from the manifest directory. Each iModel may
also contain an `instanceKeys` array:

```json
{
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

## Run

From this directory:

```sh
pnpm test
```

`CONTENT_EQUIVALENCE_OUTPUT` changes the output directory. It defaults to
`./output`.

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

`output/runs` contains one report directory per invocation. Each report includes:

- run configuration and implementation fingerprints;
- sampled keys and candidate counts;
- normalized legacy and new descriptors and values;
- structured descriptor and value differences;
- capture paths and cache-hit status;
- an aggregate summary.

Captures are written atomically. Incomplete generation is not reusable. Invalid
cache files are reported and regenerated.

The command exits unsuccessfully when any scenario has differences or an
implementation fails. Independent models and scenarios continue so one run
collects all available diagnostics.
