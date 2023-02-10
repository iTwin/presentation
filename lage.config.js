/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
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
