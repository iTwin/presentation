/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// Day-to-day linting is done with oxlint (see `.oxlintrc.json`). ESLint is only used for custom rules from
// `@itwin/eslint-plugin` that oxlint can't run, and is executed explicitly with `pnpm lint:no-internal`.
const iTwinPlugin = require("@itwin/eslint-plugin");

module.exports = [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: iTwinPlugin.configs.iTwinjsRecommendedConfig.languageOptions,
    plugins: {
      "@itwin": iTwinPlugin,
    },
    rules: {
      "@itwin/no-internal": ["error", { tag: ["internal"] }],
      "@itwin/no-internal-barrel-imports": "error",
    },
  },
];
