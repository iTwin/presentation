/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import { describe, expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, runContentTest } from "./ContentTestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";

describe("Content items", () => {
  runContentTest({
    testName: "all 10k items with 100 related groups each",
    imodelName: "10k elements in 100 groups each, 10 elements in 50k groups",
    setup: async ({ imodelAccess, config, dataset }) => {
      const { meta } = dataset;
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: meta.elementClassName }],
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
      return { provider, groupLabelField, meta };
    },
    test: async ({ provider, groupLabelField, meta }) => {
      const groups = new Set<Id64String>();
      let count = 0;
      for await (const item of provider.getItems()) {
        const related = item.getRelatedInstances({ pathFromTarget: groupLabelField.pathFromTarget });
        assert.equal(related.length, meta.groupsPerElement);
        const groupLabels = item.getValue(groupLabelField);
        assert(Array.isArray(groupLabels));
        assert.equal(groupLabels.length, meta.groupsPerElement);
        assert(groupLabels.every((label) => typeof label === "string" && label.startsWith(meta.groupUserLabelPrefix)));
        related.forEach((group) => groups.add(group.key.id));
        ++count;
      }
      expect(count).toBe(meta.elementCount);
      expect(groups.size).toBe(meta.groupCount);
    },
  });
});
