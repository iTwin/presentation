/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-unused-vars */

import { expect } from "chai";
import { insertPhysicalModelWithPartition } from "presentation-test-utilities";
import { initialize, terminate } from "../../IntegrationTests";
import { buildIModel } from "../../IModelUtils";
import { stubGetBoundingClientRect } from "../../Utils";
import { render, waitFor } from "@testing-library/react";
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.iModelAccess.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.SelectionStorage.Imports
import { TreeRenderer, UnifiedSelectionProvider, useUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { createStorage } from "@itwin/unified-selection";
import { useEffect, useState } from "react";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.CustomTreeExample.Imports
import { createBisInstanceLabelSelectClauseFactory, createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__

// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.iModelAccess
// Not really part of the package, but we need SchemaContext to create the tree state. It's
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

function createIModelAccess(imodel: IModelConnection) {
  const schemaProvider = createECSchemaProvider(getIModelSchemaContext(imodel));
  return {
    imodelKey: imodel.key,
    ...schemaProvider,
    // while caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
    ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
    // the second argument is the maximum number of rows the executor will return - this allows us to
    // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
    ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
  };
}
// __PUBLISH_EXTRACT_END__

describe("Hierarchies React", () => {
  describe("Learning snippets", () => {
    describe("Readme example", () => {
      stubGetBoundingClientRect();
      let iModel: IModelConnection;

      beforeEach(async function () {
        await initialize();
        iModel = (
          await buildIModel(this, async (builder) => {
            insertPhysicalModelWithPartition({ builder, codeValue: "My Model A" });
            insertPhysicalModelWithPartition({ builder, codeValue: "My Model B" });
          })
        ).imodel;
      });

      afterEach(async () => {
        await terminate();
      });

      it("Tree", async function () {
        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.SelectionStorage
        // Not part of the package - this should be created once and reused across different components of the application.
        const selectionStorage = createStorage();

        /** Component providing the selection storage and access to iModel. Usually this is done in a top-level component. */
        function MyTreeComponent({ imodel }: { imodel: IModelConnection }) {
          const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
          useEffect(() => {
            setIModelAccess(createIModelAccess(imodel));
          }, [imodel]);

          if (!imodelAccess) {
            return null;
          }

          return (
            <UnifiedSelectionProvider storage={selectionStorage}>
              <MyTreeComponentInternal imodelKey={imodel.key} imodelAccess={imodelAccess} />
            </UnifiedSelectionProvider>
          );
        }
        // __PUBLISH_EXTRACT_END__
        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.CustomTreeExample
        type IModelAccess = Parameters<typeof useUnifiedSelectionTree>[0]["imodelAccess"];

        // The hierarchy definition describes the hierarchy using ECSQL queries; here it just returns all `BisCore.PhysicalModel` instances
        function getHierarchyDefinition({ imodelAccess }: { imodelAccess: IModelAccess }): HierarchyDefinition {
          // Create a factory for building labels SELECT query clauses according to BIS conventions
          const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
          // Create a factory for building nodes SELECT query clauses in a format understood by the provider
          const nodesQueryFactory = createNodesQueryClauseFactory({ imodelAccess, instanceLabelSelectClauseFactory: labelsQueryFactory });
          return {
            defineHierarchyLevel: async () => [
              {
                fullClassName: "BisCore.PhysicalModel",
                query: {
                  ecsql: `
                    SELECT
                      ${await nodesQueryFactory.createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: {
                          selector: await labelsQueryFactory.createSelectClause({ classAlias: "this", className: "BisCore.PhysicalModel" }),
                        },
                        hasChildren: false,
                      })}
                    FROM BisCore.PhysicalModel this
                  `,
                },
              },
            ],
          };
        }

        /** Internal component that creates and renders tree state. */
        function MyTreeComponentInternal({ imodelAccess, imodelKey }: { imodelAccess: IModelAccess; imodelKey: string }) {
          const { rootNodes, setFormatter, isLoading, ...state } = useUnifiedSelectionTree({
            // the source name is used to distinguish selection changes being made by different components
            sourceName: "MyTreeComponent",
            // the iModel key is required for unified selection system to distinguish selection changes between different iModels
            imodelKey,
            // iModel access is used to build the hierarchy
            imodelAccess,
            // supply the hierarchy definition
            getHierarchyDefinition,
          });
          if (!rootNodes) {
            return "Loading...";
          }
          return <TreeRenderer {...state} rootNodes={rootNodes} />;
        }
        // __PUBLISH_EXTRACT_END__

        const { getByRole, getByText } = render(<MyTreeComponent imodel={iModel} />);
        await waitFor(() => getByRole("tree"));

        expect(getByText("My Model A")).to.not.be.null;
        expect(getByText("My Model B")).to.not.be.null;
      });

      it("UseUnifiedSelectionTree", async function () {
        type IModelAccess = Parameters<typeof useUnifiedSelectionTree>[0]["imodelAccess"];
        const getHierarchyDefinition = () => ({
          defineHierarchyLevel: async () => [],
        });

        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.UseUnifiedSelectionTree
        function MyTreeComponentInternal({ imodelAccess, imodelKey }: { imodelAccess: IModelAccess; imodelKey: string }) {
          const { rootNodes, ...state } = useUnifiedSelectionTree({
            // the source name is used to distinguish selection changes being made by different components
            sourceName: "MyTreeComponent",
            // the iModel key is required for unified selection system to distinguish selection changes between different iModels
            imodelKey,
            // iModel access is used to build the hierarchy
            imodelAccess,
            // the hierarchy definition describes the hierarchy using ECSQL queries
            getHierarchyDefinition,
          });
          if (!rootNodes || !rootNodes.length) {
            return "No data to display";
          }
          return <TreeRenderer {...state} rootNodes={rootNodes} />;
        }
        // __PUBLISH_EXTRACT_END__

        const { getByText } = render(<MyTreeComponentInternal imodelAccess={createIModelAccess(iModel)} imodelKey={iModel.key} />);

        expect(getByText("No data to display")).to.not.be.null;
      });
    });
  });
});
