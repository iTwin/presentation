const iTwinPlugin = require("@itwin/eslint-plugin");
const eslintBaseConfig = require("../../eslint.base.config");
const jsxRuntimeConfig = require("eslint-plugin-react");


const customLanguageOptions = {
  sourceType: "module",
  parser: require("@typescript-eslint/parser"),
  parserOptions: {
    project: ["./tsconfig.json"],
    ecmaVersion: "latest",
    ecmaFeatures: {
      jsx: true,
      modules: true,
    },
  },
};

module.exports = [
  ...eslintBaseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    ...iTwinPlugin.configs.uiConfig,
    languageOptions: customLanguageOptions,
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      ...jsxRuntimeConfig.rules,
    },
  },
];
