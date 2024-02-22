/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import react from "@vitejs/plugin-react";

const publicDirs = [
  "./node_modules/@itwin/core-react/lib/public/",
  "./node_modules/@itwin/core-frontend/lib/public",
  "./node_modules/@itwin/components-react/lib/public",
  "./node_modules/@itwin/presentation-components/lib/public",
  "./node_modules/@itwin/presentation-common/lib/public",
];

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        ...publicDirs.map((dir) => ({
          src: `${dir}/*`,
          dest: ".",
        })),
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
});
