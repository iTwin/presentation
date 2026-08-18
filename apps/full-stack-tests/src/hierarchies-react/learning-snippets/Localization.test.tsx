/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { insertPhysicalModelWithPartition } from "presentation-test-utilities";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.CommonImports
import { Props } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.Tree.Imports
import {
  LOCALIZATION_NAMESPACES,
  LocalizationContextProvider,
  useIModelTree,
} from "@itwin/presentation-hierarchies-react";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.TreeRenderer.Imports
import { StrataKitRootErrorRenderer, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
// __PUBLISH_EXTRACT_END__
import { buildTestIModel } from "../../IModelUtils.js";
import { render, waitFor } from "../../RenderUtils.js";
import { stubVirtualization } from "../../Utils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { IModelApp } from "@itwin/core-frontend";

describe("Hierarchies React", () => {
  describe("Learning snippets", () => {
    describe("Localization", () => {
      stubVirtualization();

      beforeEach(async function () {
        await initialize();
      });

      afterEach(async () => {
        await terminate();
      });

      it("Tree localization", async function () {
        const { imodelConnection } = await buildTestIModel(async (imodel) => {
          withEditTxn(imodel, (txn) => {
            insertPhysicalModelWithPartition({ txn, codeValue: "My Model A" });
            insertPhysicalModelWithPartition({ txn, codeValue: "My Model B" });
          });
        });
        const schemaProvider = createECSchemaProvider(imodelConnection);
        const access = {
          imodelKey: createIModelKey(imodelConnection),
          ...schemaProvider,
          ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
          ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodelConnection), 1000),
        };
        const getHierarchyDefinition: Props<typeof useIModelTree>["getHierarchyDefinition"] = () => ({
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
                      hasChildren: true,
                      hideIfNoChildren: false,
                      supportsFiltering: true,
                    })}
                  FROM BisCore.PhysicalModel this
                `,
              },
            },
          ],
        });

        // The localization provider used across the application. In an iTwin.js app this is usually `IModelApp.localization`.
        const localization = IModelApp.localization;

        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.RegisterNamespaces
        // Register the localization namespaces delivered by the package with your localization provider
        // (e.g. `IModelApp.localization`) during application initialization.
        for (const namespace of LOCALIZATION_NAMESPACES) {
          await localization.registerNamespace(namespace);
        }
        // __PUBLISH_EXTRACT_END__

        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.Tree
        // Wrap the tree components with `LocalizationContextProvider`, passing the same localization provider
        // used to register the namespaces. The provider resolves the package's localized strings at runtime.
        type IModelAccess = Props<typeof useIModelTree>["imodelAccess"];
        function LocalizedTree({ imodelAccess }: { imodelAccess: IModelAccess }) {
          return (
            <LocalizationContextProvider localization={localization}>
              <MyTreeComponent imodelAccess={imodelAccess} />
            </LocalizationContextProvider>
          );
        }

        function MyTreeComponent({ imodelAccess }: { imodelAccess: IModelAccess }) {
          const treeProps = useIModelTree({ imodelAccess, getHierarchyDefinition });
          if (treeProps.rootErrorRendererProps) {
            return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
          }
          if (!treeProps.treeRendererProps || treeProps.isReloading) {
            return "Loading";
          }
          return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="Localized tree" />;
        }
        // __PUBLISH_EXTRACT_END__

        const { getByText } = render(<LocalizedTree imodelAccess={access} />);
        await waitFor(() => expect(getByText("My Model A")).to.not.be.null);
      });
    });
  });
});
