/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "Full-stack tests",
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 60000,
    slowTestThreshold: 500,
    environment: "happy-dom",
    setupFiles: ["./src/setup.ts"],
    globalSetup: ["./scripts/setup-tests.js"],
    css: false,
    snapshotFormat: { escapeString: true, printBasicPrototype: true },
    environmentOptions: {
      happyDOM: {
        settings: {
          // Prevent DOMException [NetworkError] when iTwinUI injects Google Fonts <link> elements
          disableCSSFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
    server: {
      deps: {
        inline: [
          "@itwin/core-react",
          "@itwin/appui-react",
          "@itwin/components-react",
          "@itwin/imodel-components-react",
          "@itwin/presentation-components",
          "@itwin/presentation-hierarchies-react",
        ],
      },
    },
  },
});
