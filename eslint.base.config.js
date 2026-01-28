/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
const prettierConfig = require("eslint-config-prettier");
const unusedImports = require("eslint-plugin-unused-imports");
const stylistic = require("@stylistic/eslint-plugin");

module.exports = [
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      ...prettierConfig.rules,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@itwin/no-internal": [
        "error",
        {
          tag: ["internal"],
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowAny: true,
          allowBoolean: true,
          allowNever: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
        },
      ],
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          allowObjectTypes: "always",
        },
      ],
      curly: ["error", "all"],
    },
  },
  {
    plugins: {
      "unused-imports": unusedImports,
      "@stylistic": stylistic,
    },
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/learning-snippets/**"],
    rules: {
      "no-duplicate-imports": "off",
      "import/no-duplicates": "error",
      "@stylistic/object-curly-spacing": ["error", "always"],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      "unused-imports/no-unused-imports": "error",
    },
  },
];
