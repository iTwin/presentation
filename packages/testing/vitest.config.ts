/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    target: "esnext",
  },
  test: {
    environment: "happy-dom",
    include: ["src/test/**/*.test.ts"],
    testTimeout: 60000,
    slowTestThreshold: 500,
    pool: "forks",
    restoreMocks: true,
    mockReset: true,
    css: false,
    environmentOptions: {
      happyDOM: {
        settings: {
          disableCSSFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    coverage: {
      provider: "v8",
      include: ["src/presentation-testing/**/*"],
      reporter: ["text-summary", "lcov", "cobertura"],
      reportsDirectory: "./lib/test/coverage",
      thresholds: {
        statements: 100,
        functions: 100,
        branches: 100,
        lines: 100,
      },
    },
    server: {
      deps: {
        inline: ["@itwin/core-react", "@itwin/components-react", "@itwin/presentation-components"],
      },
    },
  },
});
