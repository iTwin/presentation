/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "Testing tests",
    environment: "happy-dom",
    include: ["src/test/**/*.test.ts"],
    testTimeout: 60000,
    slowTestThreshold: 500,
    restoreMocks: true,
    mockReset: true,
    css: false,
    environmentOptions: {
      happyDOM: { settings: { disableCSSFileLoading: true, handleDisabledFileLoadingAsSuccess: true } },
    },
    snapshotFormat: { escapeString: true, printBasicPrototype: true },
    coverage: {
      provider: "v8",
      include: ["src/presentation-testing/**/*.{ts,tsx}"],
      reportsDirectory: "./lib/test/coverage",
      reporter: ["text-summary", "lcov", "cobertura"],
      thresholds: { statements: 100, functions: 100, branches: 100, lines: 100 },
    },
    server: { deps: { inline: ["@itwin/core-react", "@itwin/components-react", "@itwin/presentation-components"] } },
  },
});
