/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect } from "vitest";
import { SnapshotDb } from "@itwin/core-backend";
import { createPredicateBasedHierarchyDefinition } from "@itwin/presentation-hierarchies";
import { Datasets } from "../util/Datasets.js";
import { run } from "../util/TestUtilities.js";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider.js";

import type { IModelDb } from "@itwin/core-backend";
import type {
  DefineInstanceNodeChildHierarchyLevelProps,
  HierarchyLevelDefinition,
} from "@itwin/presentation-hierarchies";

describe("hide if no children", () => {
  const setup = () => SnapshotDb.openFile(Datasets.getIModelPath("50k flat elements"));
  const cleanup = (iModel: IModelDb) => iModel.close();

  run({
    testName: `required to finalize root, w/o children`,
    setup,
    cleanup,
    test: async (iModel) => {
      const provider = new StatelessHierarchyProvider({
        iModel,
        getHierarchyFactory: (imodelAccess) => {
          return createPredicateBasedHierarchyDefinition({
            classHierarchyInspector: imodelAccess,
            hierarchy: {
              rootNodes: async ({ nodeSelectClauseFactory }) =>
                createPhysicalElementsHierarchyLevelDefinition({ nodeSelectClauseFactory, limit: 5 }),
              childNodes: [
                {
                  parentInstancesNodePredicate: `BisCore.PhysicalElement`,
                  definitions: async ({
                    parentNode,
                    nodeSelectClauseFactory,
                  }: DefineInstanceNodeChildHierarchyLevelProps) => {
                    const depth = parentNode.parentKeys.length + 1;
                    return createPhysicalElementsHierarchyLevelDefinition({
                      nodeSelectClauseFactory,
                      limit: 1000,
                      hideIfNoChildren: true,
                      hasChildren: depth >= 2 ? false : undefined,
                    });
                  },
                },
              ],
            },
          });
        },
        rowLimit: "unbounded",
      });
      const result = await provider.loadHierarchy({ depth: 1 });
      expect(result).toBe(5);
    },
  });

  run({
    testName: `required to finalize root, w/ children`,
    setup,
    cleanup,
    test: async (iModel) => {
      const provider = new StatelessHierarchyProvider({
        iModel,
        getHierarchyFactory: (imodelAccess) => {
          return createPredicateBasedHierarchyDefinition({
            classHierarchyInspector: imodelAccess,
            hierarchy: {
              rootNodes: async ({ nodeSelectClauseFactory }) =>
                createPhysicalElementsHierarchyLevelDefinition({ nodeSelectClauseFactory, limit: 5 }),
              childNodes: [
                {
                  parentInstancesNodePredicate: `BisCore.PhysicalElement`,
                  definitions: async ({
                    parentNode,
                    nodeSelectClauseFactory,
                  }: DefineInstanceNodeChildHierarchyLevelProps) => {
                    const depth = parentNode.parentKeys.length + 1;
                    return createPhysicalElementsHierarchyLevelDefinition({
                      nodeSelectClauseFactory,
                      limit: 1000,
                      hideIfNoChildren: true,
                      hasChildren: depth >= 2 ? true : undefined,
                    });
                  },
                },
              ],
            },
          });
        },
        rowLimit: "unbounded",
      });
      const result = await provider.loadHierarchy({ depth: 1 });
      expect(result).toBe(5);
    },
  });
});

async function createPhysicalElementsHierarchyLevelDefinition(props: {
  nodeSelectClauseFactory: DefineInstanceNodeChildHierarchyLevelProps["nodeSelectClauseFactory"];
  limit: number;
  hasChildren?: boolean;
  hideIfNoChildren?: boolean;
}): Promise<HierarchyLevelDefinition> {
  const { nodeSelectClauseFactory, limit, hasChildren, hideIfNoChildren } = props;
  return [
    {
      fullClassName: `BisCore.PhysicalElement`,
      query: {
        ecsql: `
          SELECT ${await nodeSelectClauseFactory.createSelectClause({
            ecClassId: { selector: `this.ECClassId` },
            ecInstanceId: { selector: `this.ECInstanceId` },
            nodeLabel: { selector: `this.UserLabel` },
            hasChildren,
            hideIfNoChildren,
          })}
          FROM BisCore.PhysicalElement AS this
          LIMIT ${limit}
        `,
      },
    },
  ];
}
