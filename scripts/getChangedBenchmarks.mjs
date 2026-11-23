/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Writes the benchmark suites affected by changes between `BASE_SHA` and `HEAD_SHA` to a GitHub Actions output.
 * All suites are selected when `BASE_SHA` is not set (e.g. manual runs).
 * Each suite contains its shard assignments, shared between base and head for PR comparisons.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, globSync } from "node:fs";
import { matchesGlob } from "node:path";

const COMMON_PATHS = [
  "apps/performance-tests/package.json",
  "apps/performance-tests/tsconfig.json",
  "apps/performance-tests/vitest.config.ts",
  "apps/performance-tests/src/setup.ts",
  "apps/performance-tests/src/util/**",
  "apps/performance-tests/tools/**",
  "packages/core-interop/**",
  "packages/shared/**",
  "packages/test-utilities/**",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  ".github/workflows/benchmark.yml",
  "scripts/getChangedBenchmarks.mjs",
];

const SUITES = [
  // `shards` is the number of parallel jobs to split the suite's test files across.
  {
    id: "content",
    name: "Content",
    shards: 8,
    paths: ["apps/performance-tests/src/content/**", "packages/content/**"],
  },
  {
    id: "hierarchies",
    name: "Hierarchies",
    shards: 4,
    paths: ["apps/performance-tests/src/hierarchies/**", "packages/hierarchies/**", "packages/tree-definitions/**"],
  },
  {
    id: "unified-selection",
    name: "Unified selection",
    shards: 2,
    paths: ["apps/performance-tests/src/unified-selection/**", "packages/unified-selection/**"],
  },
];

const { BASE_SHA: base, HEAD_SHA: head, EVENT_NAME: eventName, GITHUB_OUTPUT: output } = process.env;
// A zero SHA means there's no previous commit, e.g. when a branch is created.
let changedFiles;
if (base && !/^0+$/.test(base)) {
  const range = eventName === "pull_request" ? `${base}...${head}` : `${base}..${head}`;
  try {
    changedFiles = execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", range], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch (error) {
    if (eventName !== "push") {
      throw error;
    }
    console.warn(`Could not compare push commits ${range}: ${error.message}; running all benchmark suites.`);
  }
}

const suites = SUITES.filter(
  ({ paths }) =>
    !changedFiles || changedFiles.some((file) => [...COMMON_PATHS, ...paths].some((glob) => matchesGlob(file, glob))),
).map(({ id, name, shards: requestedShards }) => {
  const directory = `apps/performance-tests/src/${id}`;
  const headFiles = globSync(`${directory}/**/*.test.ts`);
  const baseFiles =
    eventName === "pull_request" && base
      ? execFileSync("git", ["ls-tree", "-r", "--name-only", base, "--", directory], { encoding: "utf8" })
          .split("\n")
          .filter((file) => file.endsWith(".test.ts"))
      : [];
  const files = [...new Set([...headFiles, ...baseFiles])].sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    throw new Error(`No benchmark test files found for suite "${id}".`);
  }
  const count = Math.min(requestedShards, files.length);
  return {
    id,
    name,
    shards: Array.from({ length: count }, (_, index) => ({
      index: index + 1,
      files: files
        .filter((_file, fileIndex) => fileIndex % count === index)
        .map((file) => file.slice("apps/performance-tests/".length))
        .join(" "),
    })),
  };
});

console.log(`Changed benchmark suites: ${suites.map(({ name }) => name).join(", ") || "none"}`);
appendFileSync(output, `suites=${JSON.stringify(suites)}\n`);
