/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "Tree definitions",
    include: ["src/**/*.test.ts"],
    environment: "happy-dom",
    restoreMocks: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    maxWorkers: 1,
  },
});
