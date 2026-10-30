/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "Content equivalence tests",
    include: ["src/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    reporters: ["verbose"],
    // Vitest can't stop a timed-out test, so abandoned work would overlap later tests and teardown.
    // `CONTENT_EQUIVALENCE_SCENARIO_TIMEOUT_MINUTES` bounds each scenario instead.
    testTimeout: 0,
    hookTimeout: 60 * 1000,
  },
});
