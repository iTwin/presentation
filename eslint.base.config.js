const prettierConfig = require("eslint-config-prettier");

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
          "tag": ["internal"]
        }
      ],
      "curly": ["error", "all"],
      "@itwin/no-internal-barrel-imports": "warn"
    },
  },
];
