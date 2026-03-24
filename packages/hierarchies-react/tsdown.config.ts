/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "tsdown";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";

export default defineConfig({
  entry: ["./src/presentation-hierarchies-react.ts", "./src/presentation-hierarchies-react-core.ts", "./src/presentation-hierarchies-react-stratakit.ts"],
  outDir: "./lib",
  format: ["esm"],
  fixedExtension: false,
  unbundle: true,
  external: [/\.css$/],
  plugins: [
    babel({
      presets: [reactCompilerPreset({ target: "18" })],
    }),
  ],
});
