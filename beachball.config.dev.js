const base = require("./beachball.config.js");

/** @type {import("beachball").BeachballConfig } */
module.exports = {
  ...base,
  tag: "dev",
  prereleasePrefix: "dev",
  generateChangelog: false,
};
