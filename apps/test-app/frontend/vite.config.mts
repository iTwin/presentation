/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { viteStaticCopy } from "vite-plugin-static-copy";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["stream", "events", "timers", "buffer", "util"],
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
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
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
