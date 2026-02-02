/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import glob from "fast-glob";
import { defineConfig } from "tsdown";

// Get all test files
const testFiles = await glob("src/test/**/*.{ts,tsx}");

export default defineConfig({
  entry: testFiles,
  outDir: "./lib/esm/test",
  format: ["esm"],
  fixedExtension: false,
  unbundle: true,
  clean: false,
  external: (id) => {
    return !id.startsWith("src/test/");
  },
});
