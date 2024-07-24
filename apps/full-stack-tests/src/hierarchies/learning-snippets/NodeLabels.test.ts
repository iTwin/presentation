/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { IModelConnection } from "@itwin/core-frontend";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.NodeLabels.Imports
import { createHierarchyProvider, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
import { buildIModel } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { createIModelAccess } from "../Utils";
import { collectHierarchy } from "./Utils";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Node labels", () => {
      let imodel: IModelConnection;

      before(async function () {
        await initialize();

        const res = await buildIModel(this, async (builder) => {
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const a = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, codeValue: "A" });
          const b = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "B" });
          const c = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id });
          return { a, b, c };
        });
        imodel = res.imodel;
      });

      after(async () => {
        await terminate();
      });

      it("creates a hierarchy using simple hierarchy definition", async function () {
        const imodelAccess = createIModelAccess(imodel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.NodeLabels.BisInstanceLabelSelectClauseFactory
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            // For root nodes, return a query that selects all physical elements
            if (!parentNode) {
              const queryClauseFactory = createNodesQueryClauseFactory({ imodelAccess });
              const labelSelectorsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await queryClauseFactory.createSelectClause({
                        ecClassId: { selector: "x.ECClassId" },
                        ecInstanceId: { selector: "x.ECInstanceId" },
                        nodeLabel: {
                          // Use BIS instance label select clause factory to create the label selector
                          selector: await labelSelectorsFactory.createSelectClause({
                            classAlias: "x",
                            className: "BisCore.PhysicalElement", // This is optional, but helps create a more optimal selector
                          }),
                        },
                      })}
                      FROM BisCore.PhysicalElement x
                    `,
                  },
                },
              ];
            }
            // Otherwise, return an empty array to indicate that there are no children
            return [];
          },
        };
        // The iModel contains 3 `Generic.PhysicalObject` elements with the following attributes:
        //
        // | Element Id | User Label | Code Value |
        // |------------|------------|------------|
        // | 0x14       | <NULL>     | A          |
        // | 0x15       | B          | <NULL>     |
        // | 0x16       | <NULL>     | <NULL>     |
        //
        expect(await collectHierarchy(createHierarchyProvider({ imodelAccess, hierarchyDefinition }))).to.deep.eq([
          {
            label: "A",
          },
          {
            label: "B [0-L]",
          },
          {
            label: "Physical Object [0-M]",
          },
        ]);
        // __PUBLISH_EXTRACT_END__
      });
    });
  });
});
