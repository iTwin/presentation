/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
const iTwinPlugin = require("@itwin/eslint-plugin");
const eslintBaseConfig = require("../../eslint.base.config");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");

module.exports = [
  {
    files: ["**/*.{ts,tsx}"],
    ...iTwinPlugin.configs.uiConfig,
    // Override the react-hooks plugin with the newer version
    plugins: {
      ...iTwinPlugin.configs.uiConfig.plugins,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...iTwinPlugin.configs.uiConfig.rules,
      // React Compiler rules
      "react-hooks/config": "error",
      "react-hooks/error-boundaries": "error",
      "react-hooks/component-hook-factories": "error",
      "react-hooks/gating": "error",
      "react-hooks/globals": "error",
      "react-hooks/immutability": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/purity": "error",
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/static-components": "error",
      "react-hooks/unsupported-syntax": "warn",
      "react-hooks/use-memo": "error",
      "react-hooks/incompatible-library": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...reactPlugin.configs.flat["jsx-runtime"],
  },
  ...eslintBaseConfig,
];
