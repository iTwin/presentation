/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "tsdown";
import { babel } from "@rollup/plugin-babel";

export default defineConfig({
  entry: "./src/presentation-hierarchies-react.ts",
  outDir: "./lib/esm",
  format: ["esm"],
  unbundle: true,
  external: [/\.css$/],
  plugins: [
    babel({
      babelHelpers: "bundled",
      parserOpts: {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      },
      plugins: [
        [
          "babel-plugin-react-compiler",
          {
            target: "18",
          },
        ],
      ],
      extensions: [".js", ".jsx", ".ts", ".tsx"],
    }),
  ],
});
