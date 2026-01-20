/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */
/* eslint-disable no-duplicate-imports */

// Test-specific imports should be kept out of extracted code
import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import * as sinon from "sinon";
import { Logger } from "@itwin/core-bentley";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.IModelAccessImports
import { IModelConnection } from "@itwin/core-frontend";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { createCachingECClassHierarchyInspector, Props } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.ReadmeExampleImports
import {
  createIModelHierarchyProvider,
  createNodesQueryClauseFactory,
  createPredicateBasedHierarchyDefinition,
  DefineInstanceNodeChildHierarchyLevelProps,
  HierarchyNode,
  HierarchyProvider,
} from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, ECSqlBinding } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__

import { buildIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";

// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.IModelAccess
function createIModelAccess(imodel: IModelConnection) {
  const schemaProvider = createECSchemaProvider(imodel.schemaContext);
  return {
    // The key of the iModel we're accessing
    imodelKey: createIModelKey(imodel),
    // Schema provider provides access to EC information (metadata)
    ...schemaProvider,
    // While caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
    ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
    // The second argument is the maximum number of rows the executor will return - this allows us to
    // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
    ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
  };
}
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.ReadmeExample
function createProvider(imodelAccess: Props<typeof createIModelHierarchyProvider>["imodelAccess"]): HierarchyProvider {
  // Create a factory for building labels SELECT query clauses according to BIS conventions
  const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });

  // Create a factory for building nodes SELECT query clauses in a format understood by the provider
  const nodesQueryFactory = createNodesQueryClauseFactory({ imodelAccess, instanceLabelSelectClauseFactory: labelsQueryFactory });

  // Then, define the hierarchy
  const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
    classHierarchyInspector: imodelAccess,
    hierarchy: {
      // For root nodes, select all BisCore.GeometricModel3d instances
      rootNodes: async () => [
        {
          fullClassName: "BisCore.GeometricModel3d",
          query: {
            ecsql: `
              SELECT
                ${await nodesQueryFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: {
                    selector: await labelsQueryFactory.createSelectClause({ classAlias: "this", className: "BisCore.GeometricModel3d" }),
                  },
                })}
              FROM BisCore.GeometricModel3d this
            `,
          },
        },
      ],
      childNodes: [
        {
          // For BisCore.Model parent nodes, select all BisCore.Element instances contained in corresponding model
          parentInstancesNodePredicate: "BisCore.Model",
          definitions: async ({ parentNodeInstanceIds }: DefineInstanceNodeChildHierarchyLevelProps) => [
            {
              fullClassName: "BisCore.Element",
              query: {
                ecsql: `
                  SELECT
                    ${await nodesQueryFactory.createSelectClause({
                      ecClassId: { selector: "this.ECClassId" },
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      nodeLabel: {
                        selector: await labelsQueryFactory.createSelectClause({ classAlias: "this", className: "BisCore.Element" }),
                      },
                      grouping: {
                        byClass: true,
                      },
                    })}
                  FROM BisCore.Element this
                  WHERE this.Model.Id IN (${parentNodeInstanceIds.map(() => "?").join(",")})
                `,
                bindings: [...parentNodeInstanceIds.map((id): ECSqlBinding => ({ type: "id", value: id }))],
              },
            },
          ],
        },
      ],
    },
  });

  // Finally, create the provider
  return createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
}

async function main() {
  const provider = createProvider(createIModelAccess(await getIModelConnection()));
  async function loadBranch(parentNode: HierarchyNode | undefined, indent: number = 0) {
    for await (const node of provider.getNodes({ parentNode })) {
      console.log(`${new Array(indent * 2 + 1).join(" ")}${node.label}`);
      await loadBranch(node, indent + 1);
    }
  }
  await loadBranch(undefined);
}
// __PUBLISH_EXTRACT_END__

async function getIModelConnection(): Promise<IModelConnection> {
  const { imodel } = await buildIModel("Hierarchies Learning snippets Readme example Creates expected hierarchy", async (builder) => {
    const category = insertSpatialCategory({ builder, codeValue: "Test category" });
    const model = insertPhysicalModelWithPartition({ builder, codeValue: "Test model" });
    insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "Test element 1" });
    insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "Test element 2" });
  });
  return imodel;
}

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Readme example", () => {
      let logStub: sinon.SinonStub;
      beforeEach(async () => {
        await initialize();
        // re-initialize to stubs to avoid iTwin.js core logging to console and ruining our testing strategy
        Logger.initialize(sinon.stub(), sinon.stub(), sinon.stub(), sinon.stub());
        logStub = sinon.stub(console, "log");
      });
      afterEach(async () => {
        logStub.restore();
        await terminate();
      });
      it("creates expected hierarchy", async () => {
        await main();
        expect(logStub.callCount).to.eq(4);
        expect(logStub.getCall(0).args[0]).to.match(/^Test model/);
        expect(logStub.getCall(1).args[0]).to.match(/^  Physical Object/);
        expect(logStub.getCall(2).args[0]).to.match(/^    Test element 1 \[[\d]+-[\w\d]+\]/);
        expect(logStub.getCall(3).args[0]).to.match(/^    Test element 2 \[[\d]+-[\w\d]+\]/);
      });
    });
  });
});
