/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
const iTwinPlugin = require("@itwin/eslint-plugin");
const eslintBaseConfig = require("../../eslint.base.config");
const reactPlugin = require("eslint-plugin-react");

module.exports = [
  {
    files: ["**/*.{ts,tsx}"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  {
    files: ["src/{components,hierarchies-react}/**/*.{ts,tsx}", "src/**/*.tsx"],
    ...iTwinPlugin.configs.uiConfig,
  },
  {
    files: ["src/{components,hierarchies-react}/**/*.{ts,tsx}", "src/**/*.tsx"],
    rules: {
      ...reactPlugin.configs["jsx-runtime"].rules,
    },
  },
  ...eslintBaseConfig,
];
