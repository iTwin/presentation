/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect, it } from "vitest";
import { loadRuntimeConfiguration } from "./Configuration.js";
import { runEquivalence } from "./Runner.js";

it("produces equivalent legacy and new content", async () => {
  const summaries = await runEquivalence(loadRuntimeConfiguration());
  expect(summaries.length).toBeGreaterThan(0);
});
