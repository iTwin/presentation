/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "Unified-selection-react tests",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    testTimeout: 60000,
    environment: "happy-dom",
    setupFiles: ["src/test/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/unified-selection-react/**/*.{ts,tsx}"],
      reportsDirectory: "./lib/test/coverage",
      reporter: ["text-summary", "lcov", "cobertura"],
      thresholds: {
        statements: 100,
        functions: 100,
        branches: 100,
        lines: 100,
      },
    },
  },
});
