/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
    fs: {
      allow: ["../../../../../"],
    },
  },
  resolve: {
    alias: [
      {
        // Resolve SASS tilde imports.
        find: /^~(.*)$/,
        replacement: "$1",
      },
      {
        find: "@itwin/core-electron/lib/cjs/ElectronFrontend",
        replacement: "@itwin/core-electron/src/ElectronFrontend.ts",
      },
    ],
  },
  optimizeDeps: {
    force: true,
    include: [
      "@itwin/core-electron/lib/cjs/ElectronFrontend", // import from module error
    ],
    exclude: ["@itwin/core-frontend", "@itwin/core-common"],
  },
});
