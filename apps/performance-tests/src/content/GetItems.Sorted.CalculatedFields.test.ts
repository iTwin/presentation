/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, describe, expect } from "vitest";
import { createContentProvider, defineIModelFieldsProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, PAGE_SIZE, runContentTest } from "./ContentTestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";
import type { CalculatedField, ContentTarget } from "@itwin/presentation-content";

describe("Content items", () => {
  // Calculated values can't use an index, so every row's value is computed and ordered before the first page.
  runContentTest({
    testName: "first page of 50k items, sorted by a calculated field",
    imodelName: "50k single-class elements",
    setup: async ({ imodelAccess, config, dataset }) => {
      const { schema, bucketCount } = dataset.meta;
      const elementClassName = `${schema.name}.${schema.className}` as const;
      const calculatedFieldsProvider = defineIModelFieldsProvider({
        id: "performance-tests_v1",
        getContribution: async () => ({
          calculatedFields: [
            {
              id: "ordinal-bucket",
              label: "Ordinal bucket",
              sourceClassName: elementClassName,
              expression: `this.${schema.ordinalPropertyName} % ${bucketCount}`,
              type: { kind: "primitive", type: "Integer" },
            },
          ],
        }),
      });
      const sortConfig = {
        ...config,
        imodelFieldsProviders: [...(config.imodelFieldsProviders ?? []), calculatedFieldsProvider],
      };
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: elementClassName }],
        config: sortConfig,
      });
      const provider = createContentProvider({ imodelAccess, sources, config: sortConfig });
      const descriptor = await provider.getContentDescriptor();
      const calculatedField = Object.values(descriptor.fields).find(
        (field): field is CalculatedField => field.kind === "calculated",
      );
      const ordinalField = getPropertyFields({ descriptor, propertyName: schema.ordinalPropertyName })[0];
      assert(calculatedField);
      assert(ordinalField);
      return { provider, calculatedField, ordinalField, bucketCount };
    },
    test: async ({ provider, calculatedField, ordinalField, bucketCount }) => {
      let previous = -Infinity;
      let count = 0;
      for await (const item of provider.getItems({ sorting: [{ field: calculatedField, direction: "asc" }] })) {
        const value = item.getValue(calculatedField);
        const ordinal = item.getValue(ordinalField);
        assert(typeof value === "number" && typeof ordinal === "number");
        expect(value).toBe(ordinal % bucketCount);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
        if (++count === PAGE_SIZE) {
          break;
        }
      }
      expect(count).toBe(PAGE_SIZE);
    },
  });

  // Repeated sort values require stable tie-breakers when merging pages from different sources.
  runContentTest({
    testName: "5000 sorted items across 50 sources with equal sort values",
    imodelName: "50k elements in 500 classes",
    setup: async ({ imodelAccess, config, dataset }) => {
      const { schema } = dataset.meta;
      const sortConfig = {
        ...config,
        imodelFieldsProviders: [
          ...(config.imodelFieldsProviders ?? []),
          defineIModelFieldsProvider({
            id: "performance-tests_v1",
            getContribution: async () => ({
              calculatedFields: [
                {
                  id: "constant",
                  label: "Constant",
                  sourceClassName: `${schema.name}.${schema.baseClassName}`,
                  expression: "1",
                  type: { kind: "primitive", type: "Integer" },
                },
              ],
            }),
          }),
        ],
      };
      const sources = await resolveContentSources({
        imodelAccess,
        targets: Array.from({ length: 50 }, (_, i): ContentTarget => ({
          primaryClass: `${schema.name}.${schema.classNamePrefix}_${i}`,
        })),
        config: sortConfig,
      });
      expect(sources).toHaveLength(50);
      const provider = createContentProvider({ imodelAccess, sources, config: sortConfig });
      const descriptor = await provider.getContentDescriptor();
      const constantField = Object.values(descriptor.fields).find(
        (field): field is CalculatedField => field.kind === "calculated",
      );
      assert(constantField);
      return { provider, constantField, expectedCount: (50 * dataset.meta.elementCount) / dataset.meta.classCount };
    },
    test: async ({ provider, constantField, expectedCount }) => {
      const ids = new Set<Id64String>();
      const classes = new Set<string>();
      let count = 0;
      for await (const item of provider.getItems({ sorting: [{ field: constantField, direction: "asc" }] })) {
        expect(item.getValue(constantField)).toBe(1);
        ids.add(item.primaryKey.id);
        classes.add(item.primaryKey.className);
        ++count;
      }
      expect(count).toBe(expectedCount);
      expect(ids.size).toBe(count);
      expect(classes.size).toBe(50);
    },
  });
});
