/** @type {import("lage").ConfigOptions } */
module.exports = {
  pipeline: {
    build: ["^build"],
    cover: ["build"],
    lint: [],
    docs: [],
    clean: {
      cache: false
    },
  },
  cache: true,
};
