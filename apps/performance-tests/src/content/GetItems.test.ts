/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import { collect } from "presentation-test-utilities";
import { describe, expect } from "vitest";
import { createContentProvider, defineIModelFieldsProvider, resolveContentSources } from "@itwin/presentation-content";
import { FILTER_SCENARIOS } from "./ContentSelectionScenarios.js";
import { BOUNDED_PAGE_COUNT, getPropertyFields, PAGE_SIZE, runContentTest } from "./ContentTestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";
import type { CalculatedField, ContentTarget, PropertyField } from "@itwin/presentation-content";
import type { Dataset } from "../util/Datasets.js";

describe("Content items", () => {
  // Each scenario resolves sources and builds its descriptor in setup to isolate item loading.
  // Full iteration exposes repeated work per page, including default model and category label loading;
  // first-page timing separates latency from full iteration. A sorted first page still has to order all rows.
  // Reverse-inserted ordinals make the requested sort differ from insertion order.
  for (const page of [
    { label: "all", limit: undefined },
    { label: "first page of", limit: PAGE_SIZE },
  ] as const) {
    for (const order of [
      {
        label: "unsorted",
        getSorting: () => undefined,
        validate: (ordinals: number[]) => expect(new Set(ordinals).size).toBe(ordinals.length),
      },
      {
        label: "sorted",
        getSorting: (ordinal: PropertyField) => [{ field: ordinal, direction: "asc" as const }],
        validate: (ordinals: number[]) => expect(ordinals).toEqual(Array.from(ordinals, (_, i) => i)),
      },
    ]) {
      runContentTest({
        testName: `${page.label} 50k items, ${order.label}`,
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
          const expectedCount = page.limit ?? dataset.meta.elementCount;
          return {
            provider,
            sorting: order.getSorting(ordinalField),
            ordinalField,
            modelField,
            categoryField,
            expectedCount,
            dataset,
          };
        },
        test: async ({ provider, sorting, ordinalField, modelField, categoryField, expectedCount, dataset }) => {
          const ids = new Set<Id64String>();
          const ordinals: number[] = [];
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
            if (ordinals.length === page.limit) {
              break;
            }
          }
          expect(ordinals).toHaveLength(expectedCount);
          expect(ids.size).toBe(ordinals.length);
          order.validate(ordinals);
        },
      });
    }
  }

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
        assert.equal(value, ordinal % bucketCount);
        assert(value >= previous);
        previous = value;
        if (++count === PAGE_SIZE) {
          break;
        }
      }
      expect(count).toBe(PAGE_SIZE);
    },
  });

  // The type is joined to every element to order all rows by its label before the first page. The 140 aspect paths
  // exceeding the join budget add query groups that are stitched to the sorted page.
  runContentTest({
    testName: "first page of items with many properties, owned and type aspects, sorted by a related field",
    imodelName: "50k elements with properties, types and aspects",
    setup: async ({ imodelAccess, config, dataset }) => {
      const { schema } = dataset.meta;
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: `${schema.name}.${schema.className}` }],
        config,
      });
      const provider = createContentProvider({ imodelAccess, sources, config });
      const descriptor = await provider.getContentDescriptor();
      const typeLabelField = getPropertyFields({ descriptor, propertyName: "UserLabel" }).find(
        (field) =>
          field.pathFromTarget.length === 1 &&
          field.pathFromTarget[0].targetClassName === dataset.meta.typeClassName &&
          field.pathCardinality === "one",
      );
      assert(typeLabelField);
      return { provider, typeLabelField, typeUserLabelPrefix: dataset.meta.typeUserLabelPrefix };
    },
    test: async ({ provider, typeLabelField, typeUserLabelPrefix }) => {
      let previous = "";
      let count = 0;
      for await (const item of provider.getItems({ sorting: [{ field: typeLabelField, direction: "asc" }] })) {
        const value = item.getValue(typeLabelField);
        assert(typeof value === "string" && value.startsWith(typeUserLabelPrefix) && value >= previous);
        previous = value;
        if (++count === PAGE_SIZE) {
          break;
        }
      }
      expect(count).toBe(PAGE_SIZE);
    },
  });

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
        assert.equal(item.getValue(constantField), 1);
        ids.add(item.primaryKey.id);
        classes.add(item.primaryKey.className);
        ++count;
      }
      expect(count).toBe(expectedCount);
      expect(ids.size).toBe(count);
      expect(classes.size).toBe(50);
    },
  });

  // The default configuration loads the groups of every element over a "many" cardinality path. Only the 10k
  // roots of the element chains belong to a group, so the remaining items have no related instances.
  runContentTest({
    testName: "all 50k items with related groups of 10k members",
    imodelName: "50k group member elements",
    setup: async ({ imodelAccess, config, dataset }) => {
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: dataset.meta.physicalElementClassName }],
        config,
      });
      const provider = createContentProvider({ imodelAccess, sources, config });
      const descriptor = await provider.getContentDescriptor();
      const labelField = getPropertyFields({ descriptor, propertyName: "UserLabel" }).find(
        (field) =>
          field.pathFromTarget.length === 1 &&
          field.pathFromTarget[0].relationshipName === "BisCore.ElementGroupsMembers" &&
          field.pathFromTarget[0].relationshipReverse === true &&
          field.pathFromTarget[0].targetClassName === dataset.meta.groupClassName &&
          field.pathCardinality === "many",
      );
      assert(labelField);
      return { provider, labelField, dataset };
    },
    test: async ({ provider, labelField, dataset }) => {
      const groups = new Set<Id64String>();
      const ids = new Set<Id64String>();
      let membersCount = 0;
      for await (const item of provider.getItems()) {
        const related = item.getRelatedInstances({ pathFromTarget: labelField.pathFromTarget });
        if (related.length > 0) {
          assert.equal(related.length, 1);
          assert.deepEqual(item.getValue(labelField), [dataset.meta.groupUserLabel]);
          groups.add(related[0].key.id);
          ++membersCount;
        }
        ids.add(item.primaryKey.id);
      }
      expect(ids.size).toBe(dataset.meta.elementCount);
      expect(membersCount).toBe(dataset.meta.groupCount * dataset.meta.membersPerGroup);
      expect(groups.size).toBe(dataset.meta.groupCount);
    },
  });

  // High fan-out variants of the related groups case: every targeted item has many related instances, which are
  // collected and stitched into the items of each page.
  type FanOutMeta = Dataset<"10k elements in 100 groups each, 10 elements in 50k groups">["meta"];
  for (const scenario of [
    {
      testName: "all 10k items with 100 related groups each",
      getClassName: (meta: FanOutMeta) => meta.elementClassName,
      getExpectedCounts: (meta: FanOutMeta) => ({ items: meta.elementCount, groupsPerItem: meta.groupsPerElement }),
    },
    {
      testName: "10 items with 50k related groups each",
      getClassName: (meta: FanOutMeta) => meta.hubElementClassName,
      getExpectedCounts: (meta: FanOutMeta) => ({ items: meta.hubElementCount, groupsPerItem: meta.groupCount }),
    },
  ]) {
    runContentTest({
      testName: scenario.testName,
      imodelName: "10k elements in 100 groups each, 10 elements in 50k groups",
      setup: async ({ imodelAccess, config, dataset }) => {
        const { meta } = dataset;
        const expected = scenario.getExpectedCounts(meta);
        const sources = await resolveContentSources({
          imodelAccess,
          targets: [{ primaryClass: scenario.getClassName(meta) }],
          config,
        });
        const provider = createContentProvider({ imodelAccess, sources, config });
        const descriptor = await provider.getContentDescriptor();
        const groupLabelField = getPropertyFields({ descriptor, propertyName: "UserLabel" }).find(
          (field) =>
            field.pathFromTarget.length === 1 &&
            field.pathFromTarget[0].relationshipName === "BisCore.ElementGroupsMembers" &&
            field.pathFromTarget[0].relationshipReverse === true &&
            field.pathFromTarget[0].targetClassName === meta.groupClassName &&
            field.pathCardinality === "many",
        );
        assert(groupLabelField);
        return { provider, groupLabelField, meta, expected };
      },
      test: async ({ provider, groupLabelField, meta, expected }) => {
        const groups = new Set<Id64String>();
        let count = 0;
        for await (const item of provider.getItems()) {
          const related = item.getRelatedInstances({ pathFromTarget: groupLabelField.pathFromTarget });
          assert.equal(related.length, expected.groupsPerItem);

          const groupLabels = item.getValue(groupLabelField);
          assert(Array.isArray(groupLabels));
          assert.equal(groupLabels.length, expected.groupsPerItem);
          assert(
            groupLabels.every((label) => typeof label === "string" && label.startsWith(meta.groupUserLabelPrefix)),
          );

          related.forEach((group) => groups.add(group.key.id));
          ++count;
        }
        expect(count).toBe(expected.items);
        expect(groups.size).toBe(meta.groupCount);
      },
    });
  }

  // The 140 aspect paths exceed SQLite's join budget, requiring separately fetched groups to be stitched together.
  // Each element owns aspects of only 7 classes, so most owned-aspect paths have no related instance. Only a few
  // pages are loaded, as loading all items is too slow for a benchmark.
  runContentTest({
    testName: `first ${BOUNDED_PAGE_COUNT} pages of items with many properties, owned and type aspects`,
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
      expect(aspectFields.every(({ field }) => field.pathCardinality === "one")).toBe(true);
      // Owned aspects are related to the element directly, type aspects - through the element's type.
      const ownedAspectFields = aspectFields.filter(({ field }) => field.pathFromTarget.length === 1);
      const typeAspectFields = aspectFields.filter(({ field }) => field.pathFromTarget.length === 2);
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

        // Every type owns an aspect of every class, valued `aspectClassIndex + aspectClassCount`.
        for (const { field, aspectClassIndex } of typeAspectFields) {
          assert.equal(item.getValue(field), aspectClassIndex + aspectClassCount);
        }

        // The element owns aspects of every `typeCount`-th class, starting at its type index, valued `aspectClassIndex`.
        const ownedAspects = ownedAspectFields.filter(({ field }) => item.getValue(field) !== undefined);
        for (const { field, aspectClassIndex } of ownedAspects) {
          assert.equal(item.getValue(field), aspectClassIndex);
        }
        const typeIndex = ownedAspects[0].aspectClassIndex % typeCount;
        assert.deepEqual(
          ownedAspects.map(({ aspectClassIndex }) => aspectClassIndex).sort((a, b) => a - b),
          Array.from({ length: aspectClassCount / typeCount }, (_, i) => typeIndex + i * typeCount),
        );

        ids.add(item.primaryKey.id);
        if (ids.size === BOUNDED_PAGE_COUNT * PAGE_SIZE) {
          break;
        }
      }
      expect(ids.size).toBe(BOUNDED_PAGE_COUNT * PAGE_SIZE);
    },
  });

  // Combines many classes with a large ID filter when loading items, which count and instance key benchmarks don't do.
  // Only a few pages are loaded, as loading all items of 500 classes is too slow for a benchmark.
  runContentTest({
    testName: `first ${BOUNDED_PAGE_COUNT} pages of items in 500 classes targeted by 50k explicit instance IDs`,
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
      const expectedCount = BOUNDED_PAGE_COUNT * PAGE_SIZE;
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
