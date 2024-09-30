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
  const filtering = {
    paths: getFilteringPaths(),
  };
  run({
    only: true,
    testName: `filters with 500 paths`,
    setup: (): ProviderOptions => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath("50k flat elements"));
      const fullClassName = PhysicalElement.classFullName.replace(":", ".");
      return {
        iModel,
        rowLimit: "unbounded",
        getHierarchyFactory: (imodelAccess) => ({
          async defineHierarchyLevel(props) {
            if (!props.parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: "custom",
                    children: true,
                  },
                },
              ];
            }
            if (props.parentNode.key === "custom") {
              return [
                {
                  node: {
                    key: "custom2_1",
                    label: "custom2_1",
                    children: true,
                  },
                },
                {
                  node: {
                    key: "custom2_2",
                    label: "custom2_2",
                    children: true,
                  },
                },
              ];
            }

            if (props.parentNode.key === "custom2_1") {
              return [
                {
                  node: {
                    key: "custom3_1",
                    label: "custom3_1",
                    children: true,
                  },
                },
                {
                  node: {
                    key: "custom3_2",
                    label: "custom3_2",
                    children: true,
                  },
                },
              ];
            }
            if (props.parentNode.key === "custom2_2") {
              return [
                {
                  node: {
                    key: "custom4_1",
                    label: "custom4_1",
                    children: true,
                  },
                },
                {
                  node: {
                    key: "custom4_2",
                    label: "custom4_2",
                    children: true,
                  },
                },
              ];
            }
            if (typeof props.parentNode.key === "string" && (props.parentNode.key.startsWith("custom3") || props.parentNode.key.startsWith("custom4"))) {
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
                      WHERE this.[Parent] is NULL
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
      expect(nodeCount).to.eq(1005);
    },
  });
});

export function getFilteringPaths(): HierarchyFilteringPath[] {
  const { schemaName, itemsPerGroup, defaultClassName } = Datasets.CUSTOM_SCHEMA;
  const filteringPaths = new Array<HierarchyFilteringPath>();
  for (let i = 0; i < 1000; ++i) {
    const hundredsPosition = Math.floor(i / itemsPerGroup);
    const id = `0x${(i + 20).toString(16)}`;
    const custom2Id = (i % 2) + 1;
    const thirdCustomNr = i % 2 === 0 ? "3" : "4";
    const custom3or4id = ((i + 1) % 2) + 1;
    const pathToPush = [
      { key: "custom" },
      { key: `custom2_${custom2Id}` },
      { key: `custom${thirdCustomNr}_${custom3or4id}` },
      { className: `${schemaName}.${defaultClassName}_${hundredsPosition}`, id },
    ];
    filteringPaths.push(pathToPush);
  }
  return filteringPaths;
}
