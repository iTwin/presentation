/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";
import TestReporter from "./src/util/TestReporter.js";

export default defineConfig({
  test: {
    name: "Performance tests",
    include: ["src/**/*.test.ts"],
    testTimeout: 300000,
    pool: "forks",
    fileParallelism: false,
    setupFiles: ["./src/setup.ts"],
    reporters: [new TestReporter()],
  },
});
