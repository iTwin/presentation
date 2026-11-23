/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import { collect } from "presentation-test-utilities";
import { describe, expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, PAGE_SIZE, runContentTest } from "./ContentTestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";

describe("Content items", () => {
  // Combines many classes with a large ID filter when loading items, which count and instance key benchmarks don't do.
  // Only a few pages are loaded, as loading all items of 500 classes is too slow for a benchmark.
  const pageCount = 5;
  runContentTest({
    testName: `first ${pageCount} pages of items in 500 classes targeted by 50k explicit instance IDs`,
    imodelName: "50k elements in 500 classes",
    setup: async ({ imodelAccess, config, dataset }) => {
      const { schema } = dataset.meta;
      const baseClassName = `${schema.name}.${schema.baseClassName}` as const;
      const rows = await collect(
        imodelAccess.createQueryReader({ ecsql: `SELECT ECInstanceId FROM ${baseClassName}` }),
      );
      expect(rows).toHaveLength(dataset.meta.elementCount);
      const ids = new Set(rows.map((row): Id64String => row.ECInstanceId));
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: baseClassName, instanceIds: [...ids] }],
        config,
      });
      expect(sources[0].resolvedPrimaryClasses).toHaveLength(dataset.meta.classCount);
      const provider = createContentProvider({ imodelAccess, sources, config });
      const descriptor = await provider.getContentDescriptor();
      const propertyField = getPropertyFields({ descriptor, propertyName: schema.propertyName })[0];
      assert(propertyField);
      return { provider, ids, propertyField, dataset };
    },
    test: async ({ provider, ids, propertyField, dataset }) => {
      const { elementCount, classCount, propertyValuePrefix } = dataset.meta;
      const expectedCount = pageCount * PAGE_SIZE;
      const loaded = new Set<Id64String>();
      const classes = new Set<string>();
      for await (const item of provider.getItems()) {
        assert(ids.has(item.primaryKey.id));
        const value = item.getValue(propertyField);
        assert(typeof value === "string" && value.startsWith(propertyValuePrefix));
        loaded.add(item.primaryKey.id);
        classes.add(item.primaryKey.className);
        if (loaded.size === expectedCount) {
          break;
        }
      }
      expect(loaded.size).toBe(expectedCount);
      expect(classes.size).toBe(expectedCount / (elementCount / classCount));
    },
  });
});
