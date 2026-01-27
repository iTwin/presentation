/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
const iTwinPlugin = require("@itwin/eslint-plugin");
const eslintBaseConfig = require("../../eslint.base.config");
const reactPlugin = require("eslint-plugin-react");
const unusedImports = require("eslint-plugin-unused-imports");
const stylistic = require("@stylistic/eslint-plugin");

module.exports = [
  {
    files: ["**/*.{ts,tsx}"],
    ...iTwinPlugin.configs.uiConfig,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...reactPlugin.configs.flat["jsx-runtime"],
  },
  {
    plugins: {
      "unused-imports": unusedImports,
      "@stylistic": stylistic,
    },
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-duplicate-imports": "off",
      "@stylistic/object-curly-spacing": ["error", "always"],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["error", { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" }],
    },
  },
  ...eslintBaseConfig,
];
