/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, describe, expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, PAGE_SIZE, runContentTest } from "./ContentTestUtilities.js";

describe("Content items", () => {
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
          field.related?.pathFromTarget.length === 1 &&
          field.related.pathFromTarget[0].targetClassName === dataset.meta.typeClassName &&
          field.related.pathCardinality === "one",
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
});
