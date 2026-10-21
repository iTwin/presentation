/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IModelHost } from "@itwin/core-backend";
import { Presentation } from "@itwin/presentation-backend";
import { loadRuntimeConfiguration } from "./Configuration.js";
import { createEquivalenceRun, runEquivalence } from "./Runner.js";

const config = loadRuntimeConfiguration();

describe("content equivalence", { concurrent: false }, () => {
  let run: ReturnType<typeof createEquivalenceRun>;
  beforeAll(async () => {
    await IModelHost.startup({ profileName: "presentation-content-equivalence-tests" });
    Presentation.initialize();
    run = createEquivalenceRun(config);
  });

  afterAll(async () => {
    try {
      Presentation.terminate();
    } finally {
      await IModelHost.shutdown();
    }
  });

  it.for(config.imodels)("produces equivalent legacy and new content for $name", async (imodel) => {
    const summaries = await runEquivalence(config, imodel, run);
    expect(summaries.length).toBeGreaterThan(0);
  });
});
