/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import { collect } from "presentation-test-utilities";
import { expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields } from "./ContentTestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";
import type { ContentTarget, ReadonlyPropertyField } from "@itwin/presentation-content";
import type { ECSqlQueryExecutor } from "@itwin/presentation-shared";
import type { IModelName } from "../util/Datasets.js";
import type { ContentTestContext } from "./ContentTestUtilities.js";

export type ContentProvider = ReturnType<typeof createContentProvider>;
export type ContentFilters = NonNullable<Parameters<ContentProvider["getSize"]>[0]>["filters"];

export interface ContentSelectionScenario<TName extends IModelName = IModelName> {
  name: string;
  imodelName: TName;
  /** Creates the content provider, the filters to pass to it, and the IDs of instances it's expected to return. */
  setup(
    context: ContentTestContext<TName>,
  ): Promise<{ provider: ContentProvider; filters?: ContentFilters; expectedIds: Id64String[] }>;
}

/** Infers the dataset name of a scenario, so that its `setup` gets the metadata of that dataset. */
function defineContentSelectionScenario<TName extends IModelName>(
  scenario: ContentSelectionScenario<TName>,
): ContentSelectionScenario {
  return scenario;
}

/** Scenarios that select instances by value filters. */
export const FILTER_SCENARIOS: ContentSelectionScenario[] = [
  // Selects one 100-element subclass by the value of a property inherited by all 500 classes.
  defineContentSelectionScenario({
    name: "direct-property filter",
    imodelName: "50k elements in 500 classes",
    setup: async (context) => {
      const { schema, propertyValuePrefix, elementCount, classCount } = context.dataset.meta;
      const baseClassName = `${schema.name}.${schema.baseClassName}` as const;
      const value = `${propertyValuePrefix}_123`;
      const expectedIds = await queryIds(
        context.imodelAccess,
        `SELECT ECInstanceId FROM ${baseClassName} WHERE ${schema.propertyName} = '${value}'`,
      );
      expect(expectedIds).toHaveLength(elementCount / classCount);
      return setupFilteredQuery({
        ...context,
        primaryClass: baseClassName,
        filterFieldPredicate: (field) => field.propertyName === schema.propertyName,
        value,
        expectedIds,
      });
    },
  }),

  // Selects the 10k of 50k elements that belong to a group, through a "many" cardinality path.
  defineContentSelectionScenario({
    name: "related-property filter",
    imodelName: "50k group member elements",
    setup: async (context) => {
      const { meta } = context.dataset;
      const expectedIds = await queryIds(
        context.imodelAccess,
        "SELECT TargetECInstanceId FROM BisCore.ElementGroupsMembers",
      );
      expect(expectedIds).toHaveLength(meta.groupCount * meta.membersPerGroup);
      return setupFilteredQuery({
        ...context,
        primaryClass: meta.physicalElementClassName,
        filterFieldPredicate: (field) =>
          field.propertyName === "UserLabel" &&
          field.pathCardinality === "many" &&
          field.pathFromTarget.length === 1 &&
          field.pathFromTarget[0].targetClassName === meta.groupClassName,
        value: meta.groupUserLabel,
        expectedIds,
      });
    },
  }),

  // Matches none of the 50k elements, but compares the aspect value of every element's type. The aspects of the
  // elements and their types exceed the join budget, so items are loaded through multiple query groups.
  defineContentSelectionScenario({
    name: "type-aspect filter without matches",
    imodelName: "50k elements with properties, types and aspects",
    setup: async (context) => {
      const { schema } = context.dataset.meta;
      return setupFilteredQuery({
        ...context,
        primaryClass: `${schema.name}.${schema.className}`,
        // Type aspects are related to the element through its type.
        filterFieldPredicate: (field) =>
          field.propertyName === schema.aspectPropertyName && field.pathFromTarget.length === 2,
        // Aspect values are non-negative.
        value: -1,
        expectedIds: [],
      });
    },
  }),
];

/** Scenarios for counting and listing instances: filters, plus a target with explicit IDs. */
export const CONTENT_SELECTION_SCENARIOS: ContentSelectionScenario[] = [
  // Combines 50k IDs with 500 classes.
  defineContentSelectionScenario({
    name: "50k explicit IDs",
    imodelName: "50k elements in 500 classes",
    setup: async ({ imodelAccess, config, dataset }) => {
      const { schema } = dataset.meta;
      const baseClassName = `${schema.name}.${schema.baseClassName}` as const;
      const expectedIds = await queryIds(imodelAccess, `SELECT ECInstanceId FROM ${baseClassName}`);
      expect(expectedIds).toHaveLength(dataset.meta.elementCount);
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: baseClassName, instanceIds: expectedIds }],
        config,
      });
      return { provider: createContentProvider({ imodelAccess, sources, config }), expectedIds };
    },
  }),
  ...FILTER_SCENARIOS,
];

async function queryIds(imodelAccess: ECSqlQueryExecutor, ecsql: string): Promise<Id64String[]> {
  const rows = await collect(imodelAccess.createQueryReader({ ecsql }, { rowFormat: "Indexes" }));
  return rows.map((row) => row[0]);
}

/**
 * Creates a content provider for all instances of the given class, along with filters that select the instances by
 * the given value of the first field that matches `filterFieldPredicate`.
 */
async function setupFilteredQuery({
  imodelAccess,
  config,
  primaryClass,
  filterFieldPredicate,
  value,
  expectedIds,
}: ContentTestContext & {
  primaryClass: ContentTarget["primaryClass"];
  filterFieldPredicate: (field: ReadonlyPropertyField) => boolean;
  value: string | number;
  expectedIds: Id64String[];
}) {
  const sources = await resolveContentSources({ imodelAccess, targets: [{ primaryClass }], config });
  const provider = createContentProvider({ imodelAccess, sources, config });
  const descriptor = await provider.getContentDescriptor();
  const field = getPropertyFields({ descriptor }).find(filterFieldPredicate);
  assert(field);
  const filters: ContentFilters = [{ field, operator: "is-equal", value }];
  return { provider, filters, expectedIds };
}
