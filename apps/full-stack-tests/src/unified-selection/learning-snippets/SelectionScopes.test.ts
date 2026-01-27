/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.SelectionScopes.Imports
import { computeSelection } from "@itwin/unified-selection";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { buildIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Unified selection", () => {
  describe("Learning snippets", () => {
    describe("Selection scopes", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      it("Basic selection scope", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const elementKey = insertPhysicalElement({ builder, userLabel: "test element", modelId: modelKey.id, categoryId: categoryKey.id });
          return { modelKey, categoryKey, elementKey };
        });

        const elementIds = [keys.elementKey.id];

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.SelectionScopes.BasicExample
        const queryExecutor = createECSqlQueryExecutor(imodel);
        const selection = computeSelection({ queryExecutor, elementIds, scope: "element" });
        // __PUBLISH_EXTRACT_END__

        const selectedKeys = await collect(selection);
        expect(selectedKeys).to.deep.eq([keys.elementKey]);
      });

      it("Selection scope with ancestor level", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const parentElementKey = insertPhysicalElement({ builder, userLabel: "test element", modelId: modelKey.id, categoryId: categoryKey.id });
          const elementKey = insertPhysicalElement({
            builder,
            userLabel: "test element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
            parentId: parentElementKey.id,
          });
          return { modelKey, categoryKey, parentElementKey, elementKey };
        });

        const elementIds = [keys.elementKey.id];

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.SelectionScopes.AncestorLevelExample
        const queryExecutor = createECSqlQueryExecutor(imodel);

        // Returns the parent element, or the element itself if it does not have a parent, for each element specified in `elementIds` argument.
        const selection = computeSelection({ queryExecutor, elementIds, scope: { id: "element", ancestorLevel: 1 } });
        // __PUBLISH_EXTRACT_END__

        // In this case, since the element has no parent, it should return itself
        const selectedKeys = await collect(selection);
        expect(selectedKeys).to.deep.eq([keys.parentElementKey]);
      });
    });
  });
});
