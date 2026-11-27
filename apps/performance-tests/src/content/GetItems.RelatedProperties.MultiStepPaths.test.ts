/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, describe, expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, PAGE_SIZE, runContentTest } from "./ContentTestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";

describe("Content items", () => {
  // The 140 aspect paths exceed SQLite's join budget, requiring separately fetched groups to be stitched together.
  // Each element owns aspects of only 7 classes, so most owned-aspect paths have no related instance. Only a few
  // pages are loaded, as loading all items is too slow for a benchmark.
  const pageCount = 5;
  runContentTest({
    testName: `first ${pageCount} pages of items with many properties, owned and type aspects`,
    imodelName: "50k elements with properties, types and aspects",
    setup: async ({ imodelAccess, config, dataset }) => {
      const { schema } = dataset.meta;
      const elementClassName = `${schema.name}.${schema.className}` as const;
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: elementClassName }],
        config,
      });
      const provider = createContentProvider({ imodelAccess, sources, config });
      const descriptor = await provider.getContentDescriptor();
      const propertyFields = getPropertyFields({ descriptor });
      const directFields = propertyFields.filter((field) => field.propertyClassName === elementClassName);
      expect(directFields).toHaveLength(dataset.meta.directPropertyCount);
      const aspectClassNamePrefix = `${schema.name}.${schema.aspectClassNamePrefix}`;
      const aspectFields = propertyFields
        .filter(
          (field) =>
            field.propertyName === schema.aspectPropertyName &&
            field.propertyClassName.startsWith(aspectClassNamePrefix),
        )
        .map((field) => ({
          field,
          aspectClassIndex: Number(field.propertyClassName.slice(aspectClassNamePrefix.length)),
        }));
      expect(aspectFields.every(({ field }) => field.related?.pathCardinality === "one")).toBe(true);
      const ownedAspectFields = aspectFields.filter(({ field }) => field.related?.pathFromTarget.length === 1);
      const typeAspectFields = aspectFields.filter(({ field }) => field.related?.pathFromTarget.length === 2);
      expect(ownedAspectFields).toHaveLength(dataset.meta.aspectClassCount);
      expect(typeAspectFields).toHaveLength(dataset.meta.aspectClassCount);
      return { provider, directFields, ownedAspectFields, typeAspectFields, dataset };
    },
    test: async ({ provider, directFields, ownedAspectFields, typeAspectFields, dataset }) => {
      const { aspectClassCount, typeCount } = dataset.meta;
      const ids = new Set<Id64String>();
      for await (const item of provider.getItems()) {
        for (const field of directFields) {
          const value = item.getValue(field);
          assert(typeof value === "string" && value.length === dataset.meta.directStringPropertyLength);
        }

        for (const { field, aspectClassIndex } of typeAspectFields) {
          expect(item.getValue(field)).toBe(aspectClassIndex + aspectClassCount);
        }

        const ownedAspects = ownedAspectFields.filter(({ field }) => item.getValue(field) !== undefined);
        for (const { field, aspectClassIndex } of ownedAspects) {
          expect(item.getValue(field)).toBe(aspectClassIndex);
        }
        const typeIndex = ownedAspects[0].aspectClassIndex % typeCount;
        expect(ownedAspects.map(({ aspectClassIndex }) => aspectClassIndex).sort((a, b) => a - b)).toEqual(
          Array.from({ length: aspectClassCount / typeCount }, (_, i) => typeIndex + i * typeCount),
        );

        ids.add(item.primaryKey.id);
        if (ids.size === pageCount * PAGE_SIZE) {
          break;
        }
      }
      expect(ids.size).toBe(pageCount * PAGE_SIZE);
    },
  });
});
