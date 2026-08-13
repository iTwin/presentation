/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "Shared tests",
    include: ["src/test/**/*.test.ts"],
    testTimeout: 60000,
    clearMocks: true,
    restoreMocks: true,
    env: { NODE_ENV: "development" },
    coverage: {
      provider: "v8",
      include: ["src/shared/**/*.ts"],
      reportsDirectory: "./lib/test/coverage",
      reporter: ["text-summary", "lcov", "cobertura"],
      thresholds: { statements: 100, functions: 100, branches: 100, lines: 100 },
    },
  },
});
