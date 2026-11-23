/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { assert, describe, expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { runContentTest } from "./ContentTestUtilities.js";

describe("Content items", () => {
  // Measures how the 50k-ID filter scales when iterating all items. Uses a single class, because iterating all items
  // of 500 classes is too slow; the content size and instance keys benchmarks cover the 500-class case.
  runContentTest({
    testName: "all items targeted by 50k explicit instance IDs",
    imodelName: "50k single-class elements",
    setup: async ({ imodelAccess, config, dataset }) => {
      const { schema } = dataset.meta;
      const elementClassName = `${schema.name}.${schema.className}` as const;
      const rows = await collect(
        imodelAccess.createQueryReader({ ecsql: `SELECT ECInstanceId FROM ${elementClassName}` }),
      );
      expect(rows).toHaveLength(dataset.meta.elementCount);
      const ids = rows.map((row) => row.ECInstanceId);
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: elementClassName, instanceIds: ids }],
        config,
      });
      const provider = createContentProvider({ imodelAccess, sources, config });
      await provider.getContentDescriptor();
      return { provider, ids };
    },
    test: async ({ provider, ids }) => {
      const remaining = new Set(ids);
      let count = 0;
      for await (const item of provider.getItems()) {
        assert(remaining.delete(item.primaryKey.id));
        ++count;
      }
      expect(count).toBe(ids.length);
      expect(remaining.size).toBe(0);
    },
  });
});
