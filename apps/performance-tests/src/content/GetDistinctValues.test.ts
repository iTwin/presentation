/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import { collect } from "presentation-test-utilities";
import { describe, expect } from "vitest";
import { createContentProvider, getDistinctFieldValues, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, runContentTest } from "./ContentTestUtilities.js";

import type { ContentTarget } from "@itwin/presentation-content";
import type { Dataset, IModelName } from "../util/Datasets.js";

describe("Content distinct values", () => {
  function runDistinctValuesTest<TName extends IModelName>(props: {
    name: string;
    imodelName: TName;
    /** Returns the class and property to get distinct values for, along with the expected results. */
    getScenario(meta: Dataset<TName>["meta"]): {
      primaryClass: ContentTarget["primaryClass"];
      propertyName: string;
      primaryClassCount: number;
      values: unknown[];
    };
  }) {
    runContentTest({
      testName: props.name,
      imodelName: props.imodelName,
      setup: async ({ imodelAccess, config, dataset }) => {
        const scenario = props.getScenario(dataset.meta);
        const sources = await resolveContentSources({
          imodelAccess,
          targets: [{ primaryClass: scenario.primaryClass }],
          config,
        });
        const descriptor = await createContentProvider({ imodelAccess, sources, config }).getContentDescriptor();
        const field = getPropertyFields({ descriptor, propertyName: scenario.propertyName })[0];
        assert(field);
        expect(field.primaryClassNames).toHaveLength(scenario.primaryClassCount);
        return { imodelAccess, field, expectedValues: new Set<unknown>(scenario.values) };
      },
      test: async ({ imodelAccess, field, expectedValues }) => {
        const values = await collect(getDistinctFieldValues({ imodelAccess, field }));
        expect(values).toHaveLength(expectedValues.size);
        expect(new Set(values)).toEqual(expectedValues);
      },
    });
  }

  // Shared inherited properties stress grouping applicable classes into query anchors.
  runDistinctValuesTest({
    name: "inherited property across 500 concrete classes",
    imodelName: "50k elements in 500 classes",
    getScenario: ({ schema, classCount, propertyValuePrefix }) => ({
      primaryClass: `${schema.name}.${schema.baseClassName}`,
      propertyName: schema.propertyName,
      primaryClassCount: classCount,
      values: Array.from({ length: classCount }, (_, i) => `${propertyValuePrefix}_${i}`),
    }),
  });

  // Navigation values add label resolution even though all elements share one category.
  runDistinctValuesTest({
    name: "navigation property across 500 concrete classes",
    imodelName: "50k elements in 500 classes",
    getScenario: ({ schema, classCount, categoryCodeValue }) => ({
      primaryClass: `${schema.name}.${schema.baseClassName}`,
      propertyName: "Category",
      primaryClassCount: classCount,
      values: [
        expect.objectContaining({
          key: expect.objectContaining({ className: "BisCore.SpatialCategory" }),
          label: categoryCodeValue,
        }),
      ],
    }),
  });

  // Hold the row count fixed while varying result cardinality to exercise client-side deduplication.
  runDistinctValuesTest({
    name: "10 distinct values among 50k elements",
    imodelName: "50k single-class elements",
    getScenario: ({ schema, bucketCount }) => ({
      primaryClass: `${schema.name}.${schema.className}`,
      propertyName: schema.bucketPropertyName,
      primaryClassCount: 1,
      values: Array.from({ length: bucketCount }, (_, i) => i),
    }),
  });

  runDistinctValuesTest({
    name: "50k distinct values among 50k elements",
    imodelName: "50k single-class elements",
    getScenario: ({ schema, elementCount }) => ({
      primaryClass: `${schema.name}.${schema.className}`,
      propertyName: schema.ordinalPropertyName,
      primaryClassCount: 1,
      values: Array.from({ length: elementCount }, (_, i) => i),
    }),
  });
});
