/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import { collect } from "presentation-test-utilities";
import { describe, expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, runContentTest, SCHEMA_PROVIDER_SCENARIOS } from "./ContentTestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";
import type { ContentItem, ReadonlyContentDescriptor } from "@itwin/presentation-content";
import type { Dataset } from "../util/Datasets.js";

/**
 * Number of elements whose properties are loaded one after another. Loading a single element is too fast for changes in
 * its performance to stand out from run-to-run fluctuations.
 */
const SELECTION_COUNT = 100;

describe("Content property grid", () => {
  // Simulates selecting elements one by one: every selection resolves sources, creates a descriptor and loads the item.
  // Comparing simple elements with property- and aspect-heavy ones isolates the overhead of related data.
  runPropertyGridTests({
    label: "simple elements",
    imodelName: "50k single-class elements",
    validate: ({ descriptor, item, dataset: { meta } }) => {
      const fields = [
        ...getPropertyFields({ descriptor, propertyName: meta.schema.ordinalPropertyName }),
        ...getPropertyFields({ descriptor, propertyName: meta.schema.bucketPropertyName }),
      ];
      expect(fields).toHaveLength(2);
      for (const field of fields) {
        expect(item.getValue(field)).toBeTypeOf("number");
      }
    },
  });

  runPropertyGridTests({
    label: "elements with many properties, owned and type aspects",
    imodelName: "50k elements with properties, types and aspects",
    validate: ({ descriptor, item, dataset: { meta } }) => {
      const { schema } = meta;
      const fields = getPropertyFields({ descriptor });

      const directFields = fields.filter((field) => field.propertyClassName === `${schema.name}.${schema.className}`);
      expect(directFields).toHaveLength(meta.directPropertyCount);
      for (const field of directFields) {
        expect(item.getValue(field)).toBe(
          (Number(field.propertyName.slice(schema.propertyNamePrefix.length)) % 10)
            .toString()
            .repeat(meta.directStringPropertyLength),
        );
      }

      const aspectClassNamePrefix = `${schema.name}.${schema.aspectClassNamePrefix}`;
      const aspectFields = fields
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
      // The element owns aspects of every `typeCount`-th class, valued `aspectClassIndex`.
      const ownedAspectFields = aspectFields.filter(({ field }) => field.pathFromTarget.length === 1);
      expect(ownedAspectFields).toHaveLength(meta.aspectClassCount / meta.typeCount);
      for (const { field, aspectClassIndex } of ownedAspectFields) {
        expect(item.getValue(field)).toBe(aspectClassIndex);
      }
      // The element's type owns an aspect of every class, valued `aspectClassIndex + aspectClassCount`.
      const typeAspectFields = aspectFields.filter(({ field }) => field.pathFromTarget.length === 2);
      expect(typeAspectFields).toHaveLength(meta.aspectClassCount);
      for (const { field, aspectClassIndex } of typeAspectFields) {
        expect(item.getValue(field)).toBe(aspectClassIndex + meta.aspectClassCount);
      }
    },
  });
});

function runPropertyGridTests<
  TName extends "50k single-class elements" | "50k elements with properties, types and aspects",
>(scenario: {
  label: string;
  imodelName: TName;
  validate(props: { descriptor: ReadonlyContentDescriptor; item: ContentItem; dataset: Dataset<TName> }): void;
}) {
  for (const schemaProvider of SCHEMA_PROVIDER_SCENARIOS) {
    runContentTest({
      testName: `${scenario.label}, ${schemaProvider.name}`,
      imodelName: scenario.imodelName,
      setup: async (context) => {
        const { schema } = context.dataset.meta;
        const elementClassName = `${schema.name}.${schema.className}` as const;
        const ids: Id64String[] = (
          await collect(
            context.imodelAccess.createQueryReader({
              ecsql: `SELECT ECInstanceId FROM ${elementClassName} ORDER BY ECInstanceId`,
            }),
          )
        ).map((row) => row.ECInstanceId);
        expect(ids).toHaveLength(context.dataset.meta.elementCount);
        // Spread the selected elements evenly across the dataset.
        const step = ids.length / SELECTION_COUNT;
        const selectedIds = Array.from({ length: SELECTION_COUNT }, (_, i) => ids[i * step]);
        const load = async (id: Id64String) => {
          const imodelAccess = schemaProvider.getIModelAccess(context);
          const sources = await resolveContentSources({
            imodelAccess,
            targets: [{ primaryClass: elementClassName, instanceIds: [id] }],
            config: context.config,
          });
          const provider = createContentProvider({ imodelAccess, sources, config: context.config });
          return { descriptor: await provider.getContentDescriptor(), items: await collect(provider.getItems()) };
        };

        // Validate the content of one element outside the measured section. This also warms up database caches, as
        // well as schema-provider caches when the provider is reused.
        const { descriptor, items } = await load(selectedIds[0]);
        expect(items).toHaveLength(1);
        const labelField = descriptor.fields["BisCore.Element.UserLabel"];
        assert(labelField);
        expect(items[0].getValue(labelField)).toMatch(new RegExp(`^${context.dataset.meta.userLabelPrefix}_\\d+$`));
        scenario.validate({ descriptor, item: items[0], dataset: context.dataset });

        return { load, selectedIds };
      },
      test: async ({ load, selectedIds }) => {
        for (const id of selectedIds) {
          const { items } = await load(id);
          assert.equal(items.length, 1);
          assert.equal(items[0].primaryKey.id, id);
        }
      },
    });
  }
}
