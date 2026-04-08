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
  },
});
