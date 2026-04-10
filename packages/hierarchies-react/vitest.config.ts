/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "Hierarchies-react tests",
    include: ["src/test/**/*.test.{ts,tsx}"],
    testTimeout: 60000,
    slowTestThreshold: 500,
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/presentation-hierarchies-react/**/*.{ts,tsx}"],
      reportsDirectory: "./lib/test/coverage",
      reporter: ["text-summary", "lcov", "cobertura"],
      thresholds: { statements: 100, functions: 100, branches: 100, lines: 100 },
    },
  },
});
