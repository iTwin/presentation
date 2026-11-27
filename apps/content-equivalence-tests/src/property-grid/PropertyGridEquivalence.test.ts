/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRuntimeConfiguration } from "../Configuration.js";
import { createEquivalenceRun, runEquivalence } from "../Runner.js";
import { shutdown, startup } from "./Frontend.js";
import { propertyGridSuite } from "./Suite.js";

const config = loadRuntimeConfiguration();

describe("property grid equivalence", { concurrent: false }, () => {
  let run: ReturnType<typeof createEquivalenceRun>;
  beforeAll(async () => {
    await startup();
    run = createEquivalenceRun(config, propertyGridSuite);
  });

  afterAll(async () => {
    await shutdown();
  });

  it.for(config.imodels)(
    "produces equivalent PresentationPropertyDataProvider and test app property data for $name",
    async (imodel) => {
      const summaries = await runEquivalence(config, imodel, run);
      expect(summaries.length).toBeGreaterThan(0);
    },
  );
});
