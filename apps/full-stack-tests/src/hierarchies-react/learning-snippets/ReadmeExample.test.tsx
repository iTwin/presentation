/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { useEffect, useState } from "react";
import { insertPhysicalModelWithPartition } from "presentation-test-utilities";
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.iModelAccess.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, HierarchyDefinition } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.SelectionStorage.Imports
import { createStorage, SelectionStorage } from "@itwin/unified-selection";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.CustomTreeExample.Imports
import { Props } from "@itwin/presentation-shared";
import { useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { StrataKitRootErrorRenderer, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
// __PUBLISH_EXTRACT_END__
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { render, waitFor } from "../../RenderUtils.js";
import { stubVirtualization } from "../../Utils.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";

// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.iModelAccess
function createIModelAccess(imodel: IModelConnection) {
  const schemaProvider = createECSchemaProvider(imodel.schemaContext);
  return {
    imodelKey: createIModelKey(imodel),
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
      stubVirtualization();

      beforeEach(async function () {
        await initialize();
      });

      afterEach(async () => {
        await terminate();
      });

      it("Tree", async function () {
        const { imodelConnection } = await buildTestIModel(async (builder) => {
          withEditTxn(builder, (txn) => {
            insertPhysicalModelWithPartition({ txn, codeValue: "My Model A" });
            insertPhysicalModelWithPartition({ txn, codeValue: "My Model B" });
          });
        });

        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.SelectionStorage
        // Not part of the package - this should be created once and reused across different components of the application.
        const unifiedSelectionStorage = createStorage();

        /** Component providing the selection storage and access to iModel. Usually this is done in a top-level component. */
        function MyTreeComponent({ imodel }: { imodel: IModelConnection }) {
          const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
          useEffect(() => {
            setIModelAccess(createIModelAccess(imodel));
          }, [imodel]);

          if (!imodelAccess) {
            return null;
          }

          return <MyTreeComponentInternal imodelAccess={imodelAccess} selectionStorage={unifiedSelectionStorage} />;
        }
        // __PUBLISH_EXTRACT_END__
        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.CustomTreeExample
        type IModelAccess = Props<typeof useIModelUnifiedSelectionTree>["imodelAccess"];

        // The hierarchy definition describes the hierarchy using ECSQL queries; here it just returns all `BisCore.PhysicalModel` instances
        function getHierarchyDefinition(): HierarchyDefinition {
          return {
            defineHierarchyLevel: async ({ createSelectClause }) => [
              {
                fullClassName: "BisCore.PhysicalModel",
                query: {
                  ecsql: `
                    SELECT
                      ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { of: { classAlias: "this", className: "BisCore.PhysicalModel" } },
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
        function MyTreeComponentInternal({
          imodelAccess,
          selectionStorage,
        }: {
          imodelAccess: IModelAccess;
          selectionStorage: SelectionStorage;
        }) {
          const treeProps = useIModelUnifiedSelectionTree({
            // the unified selection storage used by all app components let them share selection state
            selectionStorage,
            // the source name is used to distinguish selection changes being made by different components
            sourceName: "MyTreeComponent",
            // iModel access is used to build the hierarchy
            imodelAccess,
            // supply the hierarchy definition
            getHierarchyDefinition,
          });
          if (treeProps.rootErrorRendererProps) {
            return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
          }
          if (!treeProps.treeRendererProps || treeProps.isReloading) {
            return "Loading...";
          }

          return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="My Tree" />;
        }
        // __PUBLISH_EXTRACT_END__

        const { getByRole, getByText } = render(<MyTreeComponent imodel={imodelConnection} />);
        await waitFor(() => getByRole("tree"));

        expect(getByText("My Model A")).to.not.be.null;
        expect(getByText("My Model B")).to.not.be.null;
      });
    });
  });
});
