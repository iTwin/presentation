/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

const sharedTestOptions = {
  fileParallelism: false,
  // Vitest can't stop a timed-out test, so abandoned work would overlap later tests and teardown.
  // `CONTENT_EQUIVALENCE_SCENARIO_TIMEOUT_MINUTES` bounds each scenario instead.
  testTimeout: 0,
  hookTimeout: 60 * 1000,
};

export default defineConfig({
  test: {
    reporters: ["verbose"],
    // Both projects open the same iModels and write to the same cache, so they mustn't run in parallel.
    fileParallelism: false,
    projects: [
      { test: { ...sharedTestOptions, name: "content", include: ["src/content/**/*.test.ts"], environment: "node" } },
      {
        test: {
          ...sharedTestOptions,
          name: "property-grid",
          include: ["src/property-grid/**/*.test.ts"],
          // `@itwin/presentation-components`, used to create legacy property grid data, needs a DOM.
          environment: "happy-dom",
          environmentOptions: {
            happyDOM: { settings: { disableCSSFileLoading: true, handleDisabledFileLoadingAsSuccess: true } },
          },
          css: false,
          server: {
            deps: {
              // These packages import stylesheets, which only Vite can handle.
              inline: [
                "@itwin/core-react",
                "@itwin/components-react",
                "@itwin/imodel-components-react",
                "@itwin/presentation-components",
              ],
            },
          },
        },
      },
    ],
  },
});
