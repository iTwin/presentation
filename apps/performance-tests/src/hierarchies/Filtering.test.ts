/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IModelDb, PhysicalElement, SnapshotDb } from "@itwin/core-backend";
import { createNodesQueryClauseFactory, HierarchyFilteringPath } from "@itwin/presentation-hierarchies";
import { Datasets } from "../util/Datasets";
import { run } from "../util/TestUtilities";
import { ProviderOptions, StatelessHierarchyProvider } from "./StatelessHierarchyProvider";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

describe("filtering", () => {
  const totalNumberOfFilteringPaths = 1000;
  const filtering = {
    paths: getFilteringPaths(totalNumberOfFilteringPaths),
  };
  let hierarchyLevelECInstanceId = 19;

  run({
    only: true,
    testName: `filters with 1000 paths`,
    setup: (): ProviderOptions => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath("50k flat elements"));
      const fullClassName = PhysicalElement.classFullName.replace(":", ".");
      return {
        iModel,
        rowLimit: "unbounded",
        getHierarchyFactory: (imodelAccess) => ({
          async defineHierarchyLevel(props) {
            const query = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });

            // A hierarchy with this structure is created:
            //
            //                          id:23 -> all other BisCore.PhysicalElement
            //                         /
            //  id:20 -> id:21 -> id:22
            //                         \
            //                          id:24 -> all other BisCore.PhysicalElement
            //
            // We need to split the hierarchy in two, because we are using 1000 paths and there is a limit of 500 filtering paths for a single parent.

            if (!props.parentNode || [20, 21, 22].find((val) => val === props.parentNode?.extendedData?.ecInstanceId)) {
              ++hierarchyLevelECInstanceId;
              return [
                {
                  fullClassName,
                  query: {
                    ecsql: `
                      SELECT ${await query.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        extendedData: {
                          ecInstanceId: { selector: `this.ECInstanceId` },
                        },
                      })}
                      FROM ${fullClassName} AS this
                      WHERE this.[Parent] is NULL AND this.ECInstanceId IN (${hierarchyLevelECInstanceId === 22 ? "23, 24" : hierarchyLevelECInstanceId})
                    `,
                  },
                },
              ];
            }

            if (props.parentNode?.extendedData?.ecInstanceId <= 24) {
              return [
                {
                  fullClassName,
                  query: {
                    ecsql: `
                      SELECT ${await query.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                      })}
                      FROM ${fullClassName} AS this
                      WHERE this.[Parent] is NULL AND this.ECInstanceId NOT IN (20, 21, 22, 23, 24)
                    `,
                  },
                },
              ];
            }

            return [];
          },
        }),
        filtering,
      };
    },
    cleanup: (props: { iModel: IModelDb }) => {
      props.iModel.close();
    },
    test: async (props) => {
      const provider = new StatelessHierarchyProvider(props);
      const nodeCount = await provider.loadHierarchy();
      expect(nodeCount).to.eq(totalNumberOfFilteringPaths);
    },
  });
});

function getFilteringPaths(totalNumberOfFilteringPaths: number): HierarchyFilteringPath[] {
  const { schemaName, itemsPerGroup, defaultClassName } = Datasets.CUSTOM_SCHEMA;
  const filteringPaths = new Array<HierarchyFilteringPath>();
  for (let i = 0; i < totalNumberOfFilteringPaths; ++i) {
    const hundredsPosition = Math.floor(i / itemsPerGroup);
    const id = `0x${(i + 20).toString(16)}`;
    const nearestParentId = `0x${i < totalNumberOfFilteringPaths / 2 ? (23).toString(16) : (24).toString(16)}`;
    filteringPaths.push([
      { className: `${schemaName}.${defaultClassName}_0`, id: `0x${(20).toString(16)}` },
      { className: `${schemaName}.${defaultClassName}_0`, id: `0x${(21).toString(16)}` },
      { className: `${schemaName}.${defaultClassName}_0`, id: `0x${(22).toString(16)}` },
      { className: `${schemaName}.${defaultClassName}_0`, id: nearestParentId },
      { className: `${schemaName}.${defaultClassName}_${hundredsPosition}`, id },
    ]);
  }
  return filteringPaths;
}
