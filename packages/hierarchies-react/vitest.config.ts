/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "Hierarchies-react tests",
    include: ["src/test/**/*.test.{ts,tsx}"],
    environment: "happy-dom",
    testTimeout: 60000,
    slowTestThreshold: 500,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    pool: "forks",
    css: false,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/presentation-hierarchies-react/**/*"],
      thresholds: {
        statements: 100,
        functions: 100,
        branches: 100,
        lines: 100,
      },
      reporter: ["text-summary", "lcov", "cobertura"],
      reportsDirectory: "./lib/test/coverage",
    },
  },
});
