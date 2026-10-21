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
      ...reactHooksPlugin.configs.flat.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/unsupported-syntax": "error",
      "react-hooks/incompatible-library": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...reactPlugin.configs.flat["jsx-runtime"],
  },
  ...eslintBaseConfig,
];
