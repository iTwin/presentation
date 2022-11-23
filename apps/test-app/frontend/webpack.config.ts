/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import CopyPlugin from "copy-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import { Configuration } from "webpack";

export default function (): Configuration & { devServer?: any } {
  return {
    mode: "development",
    entry: {
      app: "./src/index.tsx",
    },
    target: "web",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "esbuild-loader",
          options: {
            loader: "tsx",
            target: "es2020",
          },
        },
        {
          test: /\.(s[ac]ss|css)$/,
          use: ["style-loader", "css-loader", "sass-loader"],
        },
        {
          test: /\.(eot|ttf|woff|woff2)$/,
          type: "asset/resource",
          generator: {
            filename: "fonts/[name].[hash][ext]",
          },
        },
        {
          test: /\.svg$/,
          type: "asset/resource",
          generator: {
            filename: "svg/[name].[hash][ext]",
          },
        },
      ],
    },
    output: {
      clean: true,
      path: path.resolve("./build"),
      publicPath: "/",
      filename: "[name].[contenthash].js",
      assetModuleFilename: "[name].[contenthash][ext]",
    },
    plugins: [
      new HtmlWebpackPlugin({
        title: "iTwin.js Presentation Test App",
        favicon: "public/favicon.ico",
        template: "src/index.html",
      }),
      new CopyPlugin({
        patterns: [
          { to: "locales", from: "public/locales" },
          { to: ".", from: "node_modules/@itwin/components-react/lib/public" },
          { to: ".", from: "node_modules/@itwin/core-frontend/lib/public" },
          { to: ".", from: "node_modules/@itwin/core-react/lib/public" },
          { to: ".", from: "node_modules/@itwin/imodel-components-react/lib/public" },
          { to: ".", from: "node_modules/@itwin/presentation-common/lib/public" },
          { to: ".", from: "node_modules/@itwin/presentation-components/lib/public" },
        ],
      }),
    ],
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
      fallback: {
        assert: false,
        os: false,
        path: false,
        fs: false,
        browser: false,
        buffer: false,
        stream: "stream-browserify",
      },
    },
    cache: {
      type: "filesystem",
      buildDependencies: {
        config: [__filename],
      },
    },
    devServer: {
      historyApiFallback: true,
      hot: true,
      port: 3000,
    },
    devtool: "cheap-module-source-map",
  };
}
