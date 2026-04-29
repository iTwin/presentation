/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "hierarchies-react-unit",
    include: ["src/test/unit/**/*.test.{ts,tsx}"],
    testTimeout: 60000,
    slowTestThreshold: 500,
    environment: "happy-dom",
    setupFiles: ["./src/test/unit/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    css: false,
  },
});
