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

The [test runner](./src/util/TestUtilities.ts) measures the `test` callback, including its assertions. Dataset initialization, `setup`, and `cleanup` are outside the measurement. Test files run sequentially locally under the shared [Vitest configuration](./vitest.config.ts).

By default, each test runs once. Set `BENCHMARK_ITERATIONS=3` to report the fastest of three iterations and its blocking measurements. Setup and cleanup run only once, so each measured callback must repeat the intended work rather than return a cached result. The test scripts enable explicit garbage collection, which runs before each timed iteration.

[MainThreadBlocksDetector.ts](./src/util/MainThreadBlocksDetector.ts) measures delayed timer callbacks to detect main-thread blocking. [TestReporter.ts](./src/util/TestReporter.ts) prints durations and blocking statistics, and writes elapsed-time and P95 blocking metrics in the GitHub benchmark action's JSON format when `BENCHMARK_OUTPUT_PATH` is set.

## Datasets

[Datasets.ts](./src/util/Datasets.ts) initializes all iModels in `./datasets`, creating or downloading any that are missing. Run `pnpm prepare:datasets` to prepare them without running benchmarks. After changing a generator, delete the affected `.bim` files from `./datasets` and run `pnpm prepare:datasets` again.

## GitHub workflows

The [benchmark workflow](../../.github/workflows/benchmark.yml) runs on pull requests, pushes to `master` and manual dispatch:

1. [getChangedBenchmarks.js](../../scripts/getChangedBenchmarks.js) picks the suites affected by the changes. Manual runs pick all suites.
2. The datasets get generated and cached. The cache key depends on the generators, test utilities and dependency lockfile.
3. Each picked suite runs in its own job and produces its own report. On pull requests the job runs one iteration and posts results as a comment. On `master` it runs three iterations and publishes benchmark history to `gh-pages`.

Draft pull requests are skipped.
