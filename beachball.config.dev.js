const base = require("./beachball.config.js");

/** @type {import("beachball").BeachballConfig } */
module.exports = {
  ...base,
  prereleasePrefix: "dev",
  generateChangelog: false,
};
