/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IModelDb, SnapshotDb } from "@itwin/core-backend";
import {
  ClassBasedHierarchyLevelDefinitionsFactory,
  DefineInstanceNodeChildHierarchyLevelProps,
  HierarchyLevelDefinition,
  NodeSelectQueryFactory,
} from "@itwin/presentation-hierarchies";
import { Datasets } from "../util/Datasets";
import { StatelessHierarchyProvider } from "../util/StatelessHierarchyProvider";
import { run } from "../util/TestUtilities";

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
          const queryFactory = new NodeSelectQueryFactory({ imodelAccess });
          return new ClassBasedHierarchyLevelDefinitionsFactory({
            classHierarchyInspector: imodelAccess,
            hierarchy: {
              rootNodes: async () => createPhysicalElementsHierarchyLevelDefinition({ queryFactory, limit: 5 }),
              childNodes: [
                {
                  parentNodeClassName: `BisCore.PhysicalElement`,
                  definitions: async ({ parentNode }: DefineInstanceNodeChildHierarchyLevelProps) => {
                    const depth = parentNode.parentKeys.length + 1;
                    return createPhysicalElementsHierarchyLevelDefinition({
                      queryFactory,
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
      expect(result).to.eq(5);
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
          const queryFactory = new NodeSelectQueryFactory({ imodelAccess });
          return new ClassBasedHierarchyLevelDefinitionsFactory({
            classHierarchyInspector: imodelAccess,
            hierarchy: {
              rootNodes: async () => createPhysicalElementsHierarchyLevelDefinition({ queryFactory, limit: 5 }),
              childNodes: [
                {
                  parentNodeClassName: `BisCore.PhysicalElement`,
                  definitions: async ({ parentNode }: DefineInstanceNodeChildHierarchyLevelProps) => {
                    const depth = parentNode.parentKeys.length + 1;
                    return createPhysicalElementsHierarchyLevelDefinition({
                      queryFactory,
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
      expect(result).to.eq(5);
    },
  });
});

async function createPhysicalElementsHierarchyLevelDefinition(props: {
  queryFactory: NodeSelectQueryFactory;
  limit: number;
  hasChildren?: boolean;
  hideIfNoChildren?: boolean;
}): Promise<HierarchyLevelDefinition> {
  const { queryFactory, limit, hasChildren, hideIfNoChildren } = props;
  return [
    {
      fullClassName: `BisCore.PhysicalElement`,
      query: {
        ecsql: `
        SELECT ${await queryFactory.createSelectClause({
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
