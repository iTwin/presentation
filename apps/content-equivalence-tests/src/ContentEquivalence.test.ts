/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { loadRuntimeConfiguration } from "./Configuration.js";
import { runEquivalence } from "./Runner.js";

const config = loadRuntimeConfiguration();

describe("content equivalence", { concurrent: false }, () => {
  it.for(config.imodels)("produces equivalent legacy and new content for $name", async (imodel) => {
    const summaries = await runEquivalence({ ...config, imodels: [imodel] });
    expect(summaries.length).toBeGreaterThan(0);
  });
});
