/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    testTimeout: 60000,
    slowTestThreshold: 500,
    pool: "forks",
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    environmentOptions: {
      happyDOM: {
        settings: {
          disableCSSFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/presentation-components/**/*.{ts,tsx}"],
      reportsDirectory: "./lib/test/coverage",
      reporter: ["text-summary", "lcov", "cobertura"],
      thresholds: {
        statements: 100,
        functions: 100,
        branches: 100,
        lines: 100,
      },
    },
    server: {
      deps: {
        inline: ["@itwin/core-react", "@itwin/appui-react", "@itwin/components-react", "@itwin/imodel-components-react"],
      },
    },
  },
});
