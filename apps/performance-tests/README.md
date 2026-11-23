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
Dataset preparation downloads Baytown first, then creates the missing iModels in a single process and logs each one's generation time. Set `RECREATE=true` to regenerate all of them.

## GitHub workflows

The [benchmark workflow](../../.github/workflows/benchmark.yml) runs on pull requests, pushes to `master` and manual dispatch:

1. [getChangedBenchmarks.mjs](../../scripts/getChangedBenchmarks.mjs) picks the suites affected by the changes. Manual runs pick all suites. Content uses 8 shards, hierarchies 4 and unified selection 2. Long content cases are in separate files so they can run on separate workers. Content item tests are grouped by operation, with file names such as `GetItems.Sorted.*`, `GetItems.RelatedProperties.*`, `GetItems.IdsFilter.*`, and `GetItems.Filters.*`.
2. The datasets get generated and cached before any benchmark starts. One job prepares them for the head revision and, on pull requests, a separate job prepares them for the base revision. The cache key depends on the contents of the generators, test utilities and dependency lockfile, so each job reuses its cache until those inputs change.
3. On pull requests, each shard builds both the exact base and PR head revisions on the same runner. The shard runs its assigned files in A/B/A/B/A/B order, with one measured iteration per test per invocation. [BenchmarkComparison.ts](./tools/BenchmarkComparison.ts) keeps each test's fastest duration and the blocking metrics from that same invocation.
4. The matrix assigns the union of base and head test files to shards. Each A/B invocation tags its results with a unique ID. Percentages are shown only when both measurements have the same invocation ID; benchmarks moved across shards retain their timings but have no percentage comparison. Tests present in only one revision are reported as new or removed, without a percentage comparison.
5. PR-only benchmark and comparison jobs combine shard results separately for base and head, then post one comparison comment per suite. Status icons mark changes greater than both 10% and 50 ms as faster or slower, smaller changes as below threshold, and equal values as unchanged. Later runs update the same comment. The comparison is also available in the job summary; fork pull requests use only the summary because their tokens cannot write comments.
6. Separate benchmark and merge jobs handle `master` and manual runs. Each test still uses the fastest of three iterations with shared setup and cleanup. The merge job combines all suites into one result set, and a publishing job sends `master` results to the "Performance benchmark" history on `gh-pages`. PR comparisons never read or write that history.

Draft pull requests are skipped.

### Publishing

The publishing job uses its `GITHUB_TOKEN` with `contents: write` to push benchmark history to `gh-pages`. The branch allows GitHub Actions to push, but blocks force pushes and deletions.
