/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, describe, expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, runContentTest } from "./ContentTestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";

describe("Content items", () => {
  // Only the 10k roots of the element chains belong to a group, so the remaining items have no related instances.
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
          field.related?.pathFromTarget.length === 1 &&
          field.related.pathFromTarget[0].relationshipName === "BisCore.ElementGroupsMembers" &&
          field.related.pathFromTarget[0].relationshipReverse === true &&
          field.related.pathFromTarget[0].targetClassName === dataset.meta.groupClassName &&
          field.related.pathCardinality === "many",
      );
      assert(labelField);
      return { provider, labelField, dataset };
    },
    test: async ({ provider, labelField, dataset }) => {
      const groups = new Set<Id64String>();
      const ids = new Set<Id64String>();
      let membersCount = 0;
      for await (const item of provider.getItems()) {
        const related = item.getRelatedInstances(labelField);
        if (related.length > 0) {
          expect(related.length).toBe(1);
          expect(item.getValue(labelField)).toStrictEqual([dataset.meta.groupUserLabel]);
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
});
