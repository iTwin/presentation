/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-duplicate-imports */
import { expect } from "chai";
import { buildIModel } from "../../IModelUtils";
import { stubGetBoundingClientRect } from "../../Utils";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { IModelConnection } from "@itwin/core-frontend";
import { render, waitFor } from "@testing-library/react";
import { initialize, terminate } from "../../IntegrationTests";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { insertPhysicalModelWithPartition } from "presentation-test-utilities";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.TreeRenderer.Imports
import { ComponentPropsWithoutRef, useCallback } from "react";
import { Tree } from "@itwin/itwinui-react";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.Tree.Imports
import { useUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.TreeRenderer.Imports
import {
  createRenderedTreeNodeData,
  LocalizationContextProvider,
  RenderedTreeNode,
  TreeNodeRenderer,
  TreeRenderer,
} from "@itwin/presentation-hierarchies-react";
// __PUBLISH_EXTRACT_END__

describe("Hierarchies React", () => {
  describe("Learning snippets", () => {
    describe("Localization", () => {
      stubGetBoundingClientRect();
      // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.Strings
      type IModelAccess = Parameters<typeof useUnifiedSelectionTree>[0]["imodelAccess"];

      const localizedStrings = {
        // strings for the `useUnifiedSelectionTree` hook
        unspecified: "Unspecified",
        other: "Other",

        // strings for `TreeRenderer` and `TreeNodeRenderer`
        loading: "Loading...",
        filterHierarchyLevel: "Apply hierarchy filter",
        clearHierarchyLevelFilter: "Clear active filter",
        noFilteredChildren: "No child nodes match current filter",
        resultLimitExceeded: "There are more items than allowed limit of {{limit}}.",
        resultLimitExceededWithFiltering: "Please provide <link>additional filtering</link> - there are more items than allowed limit of {{limit}}.",
        increaseHierarchyLimit: "<link>Increase the hierarchy level size limit to {{limit}}.</link>",
        increaseHierarchyLimitWithFiltering: "Or, <link>increase the hierarchy level size limit to {{limit}}.</link>",
      };
      // __PUBLISH_EXTRACT_END__

      let imodel: IModelConnection;
      let access: IModelAccess;
      let getHierarchyDefinition: Parameters<typeof useUnifiedSelectionTree>[0]["getHierarchyDefinition"];

      beforeEach(async function () {
        await initialize();
        imodel = (
          await buildIModel(this, async (builder) => {
            insertPhysicalModelWithPartition({ builder, codeValue: "My Model A" });
            insertPhysicalModelWithPartition({ builder, codeValue: "My Model B" });
          })
        ).imodel;
        const context = new SchemaContext();
        context.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
        const schemaProvider = createECSchemaProvider(context);
        access = {
          ...schemaProvider,
          ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
          ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
        };
        const nodesQueryFactory = createNodesQueryClauseFactory({
          imodelAccess: access,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: access }),
        });
        const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: access });
        getHierarchyDefinition = () => ({
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
      });

      afterEach(async () => {
        await terminate();
      });

      it("Tree localization", async function () {
        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.Tree
        function MyTreeComponent({ imodelAccess, imodelKey }: { imodelAccess: IModelAccess; imodelKey: string }) {
          const { rootNodes, expandNode } = useUnifiedSelectionTree({
            sourceName: "MyTreeComponent",
            imodelKey,
            imodelAccess,
            localizedStrings,
            getHierarchyDefinition,
          });
          if (!rootNodes) {
            return localizedStrings.loading;
          }
          return <TreeRenderer rootNodes={rootNodes} expandNode={expandNode} localizedStrings={localizedStrings} onFilterClick={() => {}} />;
        }
        // __PUBLISH_EXTRACT_END__

        const { getAllByRole } = render(<MyTreeComponent imodelAccess={access} imodelKey={imodel.key} />);
        await waitFor(() => getAllByRole("treeitem"));

        expect(getAllByRole("button", { name: "Apply hierarchy filter" })).to.not.be.empty;
      });

      it("Tree renderer localization", async function () {
        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Localization.TreeRenderer
        type TreeProps = ComponentPropsWithoutRef<typeof Tree<RenderedTreeNode>>;
        type TreeRendererProps = Parameters<typeof TreeRenderer>[0];

        function MyTreeRenderer(props: TreeRendererProps) {
          const nodeRenderer = useCallback<TreeProps["nodeRenderer"]>((nodeProps) => {
            return <TreeNodeRenderer {...nodeProps} onFilterClick={() => {}} expandNode={() => {}} />;
          }, []);

          const getNode = useCallback<TreeProps["getNode"]>((node) => createRenderedTreeNodeData(node, () => false), []);

          return (
            <LocalizationContextProvider localizedStrings={localizedStrings}>
              <Tree<RenderedTreeNode> {...props} data={props.rootNodes} nodeRenderer={nodeRenderer} getNode={getNode} />
            </LocalizationContextProvider>
          );
        }
        // __PUBLISH_EXTRACT_END__

        function MyTreeComponent({ imodelAccess, imodelKey }: { imodelAccess: IModelAccess; imodelKey: string }) {
          const { rootNodes, ...state } = useUnifiedSelectionTree({
            sourceName: "MyTreeComponent",
            imodelKey,
            imodelAccess,
            localizedStrings,
            getHierarchyDefinition,
          });
          if (!rootNodes) {
            return localizedStrings.loading;
          }
          return <MyTreeRenderer {...state} rootNodes={rootNodes} localizedStrings={localizedStrings} />;
        }

        const { getByRole, getAllByRole } = render(<MyTreeComponent imodelAccess={access} imodelKey={imodel.key} />);
        await waitFor(() => getByRole("tree"));

        expect(getAllByRole("button", { name: "Apply hierarchy filter" })).to.not.be.empty;
      });
    });
  });
});
