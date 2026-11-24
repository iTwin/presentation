/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, describe, expect } from "vitest";
import { FILTER_SCENARIOS } from "./ContentSelectionScenarios.js";
import { runContentTest } from "./ContentTestUtilities.js";

describe("Content items", () => {
  // Filters are applied to every page query, so selective filters can be costly even when few items are returned.
  for (const scenario of FILTER_SCENARIOS) {
    runContentTest({
      testName: `all items with ${scenario.name}`,
      imodelName: scenario.imodelName,
      setup: async (context) => {
        const { provider, filters, expectedIds } = await scenario.setup(context);
        await provider.getContentDescriptor();
        return { provider, filters, expectedIds };
      },
      test: async ({ provider, filters, expectedIds }) => {
        const remaining = new Set(expectedIds);
        let count = 0;
        for await (const item of provider.getItems({ filters })) {
          assert(remaining.delete(item.primaryKey.id));
          ++count;
        }
        expect(count).toBe(expectedIds.length);
        expect(remaining.size).toBe(0);
      },
    });
  }
});
