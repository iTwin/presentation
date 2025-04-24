/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
const iTwinPlugin = require("@itwin/eslint-plugin");
const eslintBaseConfig = require("../../eslint.base.config");

module.exports = [
  {
    files: ["**/*.ts"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  {
    files: ["src/presentation-testing/Helpers.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
  {
    files: ["**/*.test.ts", "src/test/setup.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  ...eslintBaseConfig,
];
