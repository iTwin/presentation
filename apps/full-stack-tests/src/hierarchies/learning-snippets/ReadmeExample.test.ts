/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

// Test-specific imports should be kept out of extracted code
import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import * as sinon from "sinon";
import { buildIModel } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";

// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Readme.BasicExample
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import {
  createClassBasedHierarchyDefinition,
  createHierarchyProvider,
  createLimitingECSqlQueryExecutor,
  createNodesQueryClauseFactory,
  DefineInstanceNodeChildHierarchyLevelProps,
  HierarchyNode,
  HierarchyProvider,
} from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, createCachingECClassHierarchyInspector, ECSqlBinding } from "@itwin/presentation-shared";

// Not really part of the package, but we need SchemaContext to create a hierarchy provider. It's
// recommended to cache the schema context and reuse it across different application's components to
// avoid loading and storing same schemas multiple times.
const imodelSchemaContextsCache = new Map<string, SchemaContext>();
function getIModelSchemaContext(imodel: IModelConnection) {
  let context = imodelSchemaContextsCache.get(imodel.key);
  if (!context) {
    context = new SchemaContext();
    context.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    imodelSchemaContextsCache.set(imodel.key, context);
    imodel.onClose.addListener(() => imodelSchemaContextsCache.delete(imodel.key));
  }
  return context;
}

function createProvider(imodel: IModelConnection): HierarchyProvider {
  // First, set up access to the iModel
  const schemaProvider = createECSchemaProvider(getIModelSchemaContext(imodel));
  const imodelAccess = {
    ...schemaProvider,
    // While caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
    ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
    // The second argument is the maximum number of rows the executor will return - this allows us to
    // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
    ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
  };

  // Create a factory for building nodes SELECT query clauses in a format understood by the provider
  const nodesQueryFactory = createNodesQueryClauseFactory({ imodelAccess });
  // Create a factory for building labels SELECT query clauses according to BIS conventions
  const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });

  // Then, define the hierarchy
  const hierarchyDefinition = createClassBasedHierarchyDefinition({
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
          parentNodeClassName: "BisCore.Model",
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
  return createHierarchyProvider({ imodelAccess, hierarchyDefinition });
}

async function main() {
  const provider = createProvider(await getIModelConnection());
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
