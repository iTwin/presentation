/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 60000,
    slowTestThreshold: 500,
    pool: "forks",
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    environmentOptions: {
      jsdom: {
        console: true,
      },
    },
    setupFiles: ["./src/setup.ts"],
    globalSetup: ["./scripts/setup-tests.js"],
    css: false,
    server: {
      deps: {
        inline: ["@itwin/core-react", "@itwin/appui-react", "@itwin/components-react", "@itwin/imodel-components-react", "@itwin/presentation-components"],
      },
    },
  },
});
