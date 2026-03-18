/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset({ target: "18" })],
    }),
    viteStaticCopy({
      targets: [
        {
          // copy assets from `@itwin` dependencies
          src: "./node_modules/@itwin/*/lib/public/*",
          dest: ".",
        },
      ],
    }),
  ],
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    alias: [
      {
        // Resolve SASS tilde imports.
        find: /^~(.*)$/,
        replacement: "$1",
      },
    ],
  },
  build: {
    assetsInlineLimit: (filePath) => {
      if (filePath.includes("@itwin/itwinui-icons/")) {
        return false;
      }
      return undefined;
    },
  },
});
