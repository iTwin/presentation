/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
const iTwinPlugin = require("@itwin/eslint-plugin");

module.exports = [
  {
    files: ["**/*.ts"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
];
