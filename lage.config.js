/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @type {import("lage").ConfigOptions } */
module.exports = {
  pipeline: {
    build: {
      dependsOn: ["^build"],
      outputs: ["lib/**"],
      inputs: ["src/**"],
    },
    cover: {
      dependsOn: ["build"],
      outputs: [],
      inputs: ["lib/**"],
    },
    lint: {
      dependsOn: ["build"],
      outputs: [],
      inputs: ["src/**"],
    },
    docs: {
      dependsOn: ["build"],
      outputs: ["build/docs/**"],
      inputs: ["src/**"],
    },
    "update-extractions": {
      dependsOn: ["docs"],
      outputs: ["learning/**"],
      inputs: ["build/docs/extract/**"],
    },
    "check-extractions": {
      dependsOn: ["docs"],
      outputs: [],
      inputs: ["build/docs/extract/**"],
    },
    "extract-api": {
      dependsOn: ["build"],
      outputs: ["api/**"],
      inputs: ["lib/**"],
    },
    "check-internal": {
      dependsOn: ["extract-api"],
      outputs: [],
      inputs: ["api/**"],
    },
    clean: {
      cache: false,
    },
  },
  npmClient: "pnpm",
};
