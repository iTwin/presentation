// see https://github.com/changesets/changesets/blob/main/docs/modifying-changelog-format.md

/** @type {import('@changesets/types').ChangelogFunctions} */
module.exports = {
  getReleaseLine: async ({ commit, summary }, type, options) => {
    if (!options.repo) {
      throw new Error('Please provide a repo to this changelog generator like this:\n"changelog": ["./changelog-github.mjs", { "repo": "org/repo" }]');
    }

    const [firstLine, ...futureLines] = summary.split("\n").map((l) => l.trimEnd());

    // find PR number associated with the commit; `getCommitInfo` batches concurrent lookups into GraphQL requests of up to 50 commits
    const prOrCommit = await (async () => {
      try {
        const { getCommitInfo } = await import("@changesets/get-github-info");
        if (!commit) {
          throw new Error("no commit associated with the changeset found");
        }
        const info = await getCommitInfo({ commit, repo: options.repo });
        if (!info?.pull) {
          throw new Error("no pull request associated with the commit found");
        }
        return info.pull.markdownLink;
      } catch (e) {
        // fallback to commit sha if API call fails for some reason
        console.warn(`Failed to find PR for commit ${commit}, using commit sha instead: ${e instanceof Error ? e.message : e}`);
        return commit;
      }
    })();

    let returnVal = `- ${prOrCommit}: ${firstLine}`;

    // indent everything so it's aligned with the first line
    if (futureLines.length > 0) {
      returnVal += `\n${futureLines.map((l) => `  ${l}`).join("\n")}`;
    }

    return returnVal;
  },

  getDependencyReleaseLine: async (changesets, dependenciesUpdated) => {
    if (dependenciesUpdated.length === 0) {
      return "";
    }

    const updatedDependenciesList = dependenciesUpdated.map((dependency) => `  - ${dependency.name}@${dependency.newVersion}`);

    return ["- Updated dependencies:", ...updatedDependenciesList].join("\n");
  },
};
