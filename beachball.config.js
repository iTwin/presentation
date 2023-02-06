/** @type {import("beachball").BeachballConfig } */
module.exports = {
  bumpDeps: false,
  access: "public",
  tag: "latest",
  scope: [
    "packages/**"
  ],
  ignorePatterns: [
    ".nycrc",
    ".eslintrc.json",
    ".mocharc.json",
    "tsconfig.*",
    ".*ignore",
    ".github/**",
    ".vscode/**",
    "**/test/**",
    "pnpm-lock.yaml",
  ],
  changehint: "Run 'pnpm change' to generate a change file",
  changelog: {
    customRenderers: {
      renderEntry: (entry) => {
        const commitLink = `https://github.com/iTwin/presentation/commit/${entry.commit}`;
        return `- ${entry.comment} ([commit](${commitLink}))`
      },
    },
  },
};
