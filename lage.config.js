/** @type {import("lage").ConfigOptions } */
module.exports = {
  pipeline: {
    build: ["^build"],
    cover: ["build"],
    lint: ["build"],
    docs: ["build"],
    clean: {
      cache: false
    },
  },
  cache: true,
};
