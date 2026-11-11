/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import { describe, expect } from "vitest";
import { CONTENT_SELECTION_SCENARIOS } from "./ContentSelectionScenarios.js";
import { runContentTest } from "./ContentTestUtilities.js";

// Counts and keys measure query building and execution without the cost of streaming all property values.
describe("Content size", () => {
  for (const scenario of CONTENT_SELECTION_SCENARIOS) {
    runContentTest({
      testName: scenario.name,
      imodelName: scenario.imodelName,
      setup: scenario.setup,
      test: async ({ provider, filters, expectedIds }) => {
        expect(await provider.getSize({ filters })).toBe(expectedIds.length);
      },
    });
  }
});

describe("Content instance keys", () => {
  // Consume the whole iterator so that every page of keys is loaded.
  for (const scenario of CONTENT_SELECTION_SCENARIOS) {
    runContentTest({
      testName: scenario.name,
      imodelName: scenario.imodelName,
      setup: scenario.setup,
      test: async ({ provider, filters, expectedIds }) => {
        const remaining = new Set(expectedIds);
        let count = 0;
        for await (const key of provider.getInstanceKeys({ filters })) {
          assert(remaining.delete(key.id));
          ++count;
        }
        expect(count).toBe(expectedIds.length);
        expect(remaining.size).toBe(0);
      },
    });
  }
});
