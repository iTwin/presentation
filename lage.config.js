/** @type {import("lage").ConfigOptions } */
module.exports = {
  pipeline: {
    build: ["^build"],
    cover: ["build"],
    lint: [],
  },
  cache: true,
};
