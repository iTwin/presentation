/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import { expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, PAGE_SIZE, runContentTest } from "./ContentTestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";

/**
 * Measures loading items of the 50k single-class iModel. Reverse-inserted ordinals make the sorted order differ from
 * insertion order.
 */
export function runSingleClassItemsTest({ sorted, scope }: { sorted: boolean; scope: "first page" | "all items" }) {
  runContentTest({
    testName: `${scope === "first page" ? "first page of" : "all"} 50k items, ${sorted ? "sorted" : "unsorted"}`,
    imodelName: "50k single-class elements",
    setup: async ({ imodelAccess, config, dataset }) => {
      const { schema } = dataset.meta;
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: `${schema.name}.${schema.className}` }],
        config,
      });
      const provider = createContentProvider({ imodelAccess, sources, config });
      const descriptor = await provider.getContentDescriptor();
      const ordinalField = getPropertyFields({ descriptor, propertyName: schema.ordinalPropertyName })[0];
      const modelField = descriptor.fields["BisCore.Element.Model"];
      const categoryField = descriptor.fields["BisCore.GeometricElement3d.Category"];
      assert(ordinalField);
      assert(modelField);
      assert(categoryField);
      return { provider, ordinalField, modelField, categoryField, dataset };
    },
    test: async ({ provider, ordinalField, modelField, categoryField, dataset }) => {
      const ids = new Set<Id64String>();
      const ordinals: number[] = [];
      const sorting = sorted ? [{ field: ordinalField, direction: "asc" as const }] : undefined;
      for await (const item of provider.getItems({ sorting })) {
        const value = item.getValue(ordinalField);
        assert(typeof value === "number");
        if (ordinals.length === 0) {
          expect(item.getValue(modelField)).toMatchObject({
            key: { className: "BisCore.PhysicalModel" },
            label: dataset.meta.modelCodeValue,
          });
          expect(item.getValue(categoryField)).toMatchObject({
            key: { className: "BisCore.SpatialCategory" },
            label: dataset.meta.categoryCodeValue,
          });
        }
        ordinals.push(value);
        ids.add(item.primaryKey.id);
        if (scope === "first page" && ordinals.length === PAGE_SIZE) {
          break;
        }
      }
      expect(ordinals).toHaveLength(scope === "first page" ? PAGE_SIZE : dataset.meta.elementCount);
      expect(ids.size).toBe(ordinals.length);
      if (sorted) {
        expect(ordinals).toEqual(Array.from(ordinals, (_, i) => i));
      } else {
        expect(new Set(ordinals).size).toBe(ordinals.length);
      }
    },
  });
}
