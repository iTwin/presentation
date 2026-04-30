/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "hierarchies-react-unit",
          include: ["src/test/unit/**/*.test.{ts,tsx}"],
          testTimeout: 60000,
          environment: "happy-dom",
          setupFiles: ["./src/test/unit/setup.ts"],
          clearMocks: true,
          restoreMocks: true,
          mockReset: true,
          css: false,
        },
      },
      {
        plugins: [react()],
        test: {
          name: "hierarchies-react-components",
          include: ["src/test/components/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/test/components/setup.tsx"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium", viewport: { width: 800, height: 600 } }],
            expect: {
              toMatchScreenshot: {
                comparatorName: "pixelmatch",
                comparatorOptions: { threshold: 0.2, allowedMismatchedPixelRatio: 0.01 },
              },
            },
          },
        },
      },
    ],
    slowTestThreshold: 500,
  },
});
