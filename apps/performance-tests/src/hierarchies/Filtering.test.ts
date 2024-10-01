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
  const totalNumberOfFilteringPaths = 10000;
  const startingIndex = 20;
  const maximumNumberOfPathsForSingleParent = 500;
  const parentIdsArr = new Array<number>();
  for (let i = maximumNumberOfPathsForSingleParent, j = startingIndex + 1; i <= totalNumberOfFilteringPaths; i += maximumNumberOfPathsForSingleParent, ++j) {
    parentIdsArr.push(j);
  }
  const filtering = {
    paths: getFilteringPaths(totalNumberOfFilteringPaths, parentIdsArr, startingIndex, maximumNumberOfPathsForSingleParent),
  };

  run({
    testName: `filters with 10000 paths`,
    setup: (): ProviderOptions => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath("50k flat elements"));
      const fullClassName = PhysicalElement.classFullName.replace(":", ".");
      return {
        iModel,
        rowLimit: "unbounded",
        getHierarchyFactory: (imodelAccess) => ({
          async defineHierarchyLevel(props) {
            // A hierarchy with this structure is created:
            //
            //        id:21 -> all other BisCore.PhysicalElement
            //       /  .
            //  id:20   .
            //       \  .
            //        id:40 -> all other BisCore.PhysicalElement
            //
            // We need to split the hierarchy in 20 parts, because we are using 10000 paths and there is a limit of 500 filtering paths for a single parent.

            if (!props.parentNode) {
              const query = createNodesQueryClauseFactory({
                imodelAccess,
                instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
              });
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
                      WHERE this.ECInstanceId = ${startingIndex}
                    `,
                  },
                },
              ];
            }

            if (props.parentNode?.extendedData?.ecInstanceId === startingIndex) {
              const query = createNodesQueryClauseFactory({
                imodelAccess,
                instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
              });
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
                      WHERE this.ECInstanceId IN (${parentIdsArr.join(", ")})
                    `,
                  },
                },
              ];
            }

            if (parentIdsArr.includes(props.parentNode?.extendedData?.ecInstanceId)) {
              const query = createNodesQueryClauseFactory({
                imodelAccess,
                instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
              });
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
                      WHERE this.[Parent] is NULL AND this.ECInstanceId NOT IN (${startingIndex}, ${parentIdsArr.join(", ")})
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

function getFilteringPaths(
  totalNumberOfFilteringPaths: number,
  parentIdsArr: number[],
  startingIndex: number,
  maximumNumberOfPathsForSingleParent: number,
): HierarchyFilteringPath[] {
  const { schemaName, itemsPerGroup, defaultClassName } = Datasets.CUSTOM_SCHEMA;
  const filteringPaths = new Array<HierarchyFilteringPath>();
  for (let i = 0; i < totalNumberOfFilteringPaths; ++i) {
    const hundredsPosition = Math.floor(i / itemsPerGroup);
    const id = `0x${(i + startingIndex).toString(16)}`;
    const nearestParentId = `0x${parentIdsArr[i % Math.ceil(totalNumberOfFilteringPaths / maximumNumberOfPathsForSingleParent)].toString(16)}`;
    filteringPaths.push([
      { className: `${schemaName}.${defaultClassName}_0`, id: `0x${startingIndex.toString(16)}` },
      { className: `${schemaName}.${defaultClassName}_0`, id: nearestParentId },
      { className: `${schemaName}.${defaultClassName}_${hundredsPosition}`, id },
    ]);
  }
  return filteringPaths;
}
