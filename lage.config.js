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
      inputs: ["lib/**"],
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
    ["@itwin/presentation-components#extract-api"]: ["@itwin/presentation-components#build"],
    ["@itwin/presentation-testing#extract-api"]: ["@itwin/presentation-testing#build"],
    ["@itwin/presentation-opentelemetry#extract-api"]: ["@itwin/presentation-opentelemetry#build"],
    clean: {
      cache: false,
    },
  },
  npmClient: "pnpm",
};
