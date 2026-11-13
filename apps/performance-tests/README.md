# Presentation performance tests

Benchmarks for content, hierarchies, and unified selection. The tests exercise the public APIs against local iModels and report elapsed time and main-thread blocking.

## Usage

Build from the repository root:

```bash
pnpm lage build --to presentation-performance-tests
```

From this package directory, use `pnpm test` to run all tests, or choose a suite:

| Suite             | Tests                         | Tests with JSON results            |
| ----------------- | ----------------------------- | ---------------------------------- |
| Content           | `pnpm test:content`           | `pnpm benchmark:content`           |
| Hierarchies       | `pnpm test:hierarchies`       | `pnpm benchmark:hierarchies`       |
| Unified selection | `pnpm test:unified-selection` | `pnpm benchmark:unified-selection` |

Each benchmark command writes `<suite>-benchmark.json` in this directory. The benchmark commands also work from the repository root. To choose another output path, run `BENCHMARK_OUTPUT_PATH=./results.json pnpm test`.

## Measurement

The [test runner](./src/util/TestUtilities.ts) measures the `test` callback, including its assertions. Dataset initialization, `setup`, and `cleanup` are outside the measurement. Test files run sequentially under the shared [Vitest configuration](./vitest.config.ts).

By default, each test runs once. Set `BENCHMARK_ITERATIONS=3` to report the fastest of three iterations and its blocking measurements. Setup and cleanup run only once, so each measured callback must repeat the intended work rather than return a cached result. The test scripts enable explicit garbage collection, which runs before each timed iteration.

[MainThreadBlocksDetector.ts](./src/util/MainThreadBlocksDetector.ts) measures delayed timer callbacks to detect main-thread blocking. [TestReporter.ts](./src/util/TestReporter.ts) prints durations and blocking statistics, and writes elapsed-time and P95 blocking metrics in the GitHub benchmark action's JSON format when `BENCHMARK_OUTPUT_PATH` is set.

## Datasets

[Datasets.ts](./src/util/Datasets.ts) initializes all iModels in `./datasets`, creating or downloading any that are missing. After changing a generator, run `RECREATE=true pnpm test` to regenerate synthetic datasets locally.

## GitHub workflows

Each suite has separate PR and master workflows:

| Suite             | Pull requests                                                             | Master and manual runs                                                     |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Content           | [PR workflow](../../.github/workflows/benchmark-pr-content.yml)           | [Master workflow](../../.github/workflows/benchmark-content.yml)           |
| Hierarchies       | [PR workflow](../../.github/workflows/benchmark-pr-hierarchies.yml)       | [Master workflow](../../.github/workflows/benchmark-hierarchies.yml)       |
| Unified selection | [PR workflow](../../.github/workflows/benchmark-pr-unified-selection.yml) | [Master workflow](../../.github/workflows/benchmark-unified-selection.yml) |

- PR workflows skip drafts and post results as a comment. They use the default single iteration.
- Master workflows run three iterations and publish benchmark history to `gh-pages` when running on `master`. They also support manual dispatch.
- Automatic runs use path filters for the relevant packages and benchmark infrastructure.
- Workflows cache iModels using keys derived from dataset generator files.
