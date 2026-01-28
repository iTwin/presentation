/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { PhysicalElement, SnapshotDb } from "@itwin/core-backend";
import { Id64 } from "@itwin/core-bentley";
import { createNodesQueryClauseFactory, HierarchyNode } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
import { Datasets } from "../util/Datasets";
import { run } from "../util/TestUtilities";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider";

import type { IModelDb } from "@itwin/core-backend";
import type { DefineHierarchyLevelProps, HierarchySearchPath } from "@itwin/presentation-hierarchies";
import type { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";

describe("search", () => {
  const totalNumberOfSearchPaths = 50000;
  // We could use any number here.
  // Using 1k because of two reasons:
  // 1. It is more than Compound SELECT Statement limit (500);
  // 2. Test takes < 20s. With more paths it would take longer.
  const numberOfPathsForASingleParent = 1000;
  const physicalElementsSmallestDecimalId = 20;

  run({
    testName: `searches with ${totalNumberOfSearchPaths} paths`,
    setup: () => {
      const { schemaName, itemsPerGroup, defaultClassName } = Datasets.CUSTOM_SCHEMA;
      const search = {
        paths: new Array<HierarchySearchPath>(),
      };
      const parentIdsArr = new Array<number>();
      for (let i = 1; i <= totalNumberOfSearchPaths / numberOfPathsForASingleParent; ++i) {
        parentIdsArr.push(i + physicalElementsSmallestDecimalId);
        for (let j = (i - 1) * numberOfPathsForASingleParent; j < i * numberOfPathsForASingleParent; ++j) {
          search.paths.push([
            { className: `${schemaName}.${defaultClassName}_0`, id: `0x${physicalElementsSmallestDecimalId.toString(16)}` },
            {
              className: `${schemaName}.${defaultClassName}_${Math.floor(i / itemsPerGroup)}`,
              id: `0x${(i + physicalElementsSmallestDecimalId).toString(16)}`,
            },
            {
              className: `${schemaName}.${defaultClassName}_${Math.floor(j / itemsPerGroup)}`,
              id: `0x${(j + physicalElementsSmallestDecimalId).toString(16)}`,
            },
          ]);
        }
      }

      const iModel = SnapshotDb.openFile(Datasets.getIModelPath("50k flat elements"));
      const fullClassName = PhysicalElement.classFullName.replace(":", ".");
      const createHierarchyLevelDefinition = async (imodelAccess: ECSchemaProvider & ECClassHierarchyInspector, whereClause: (alias: string) => string) => {
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
                ${whereClause("this")}
              `,
            },
          },
        ];
      };
      return {
        iModel,
        getHierarchyFactory: (imodelAccess: ECSchemaProvider & ECClassHierarchyInspector) => ({
          async defineHierarchyLevel(props: DefineHierarchyLevelProps) {
            // A hierarchy with this structure is created:
            //
            //        id:21 -> all other BisCore.PhysicalElement
            //       /  .
            //  id:20   .
            //       \  .
            //        id:70 -> all other BisCore.PhysicalElement
            //
            // We need to split the hierarchy in 50 parts to reduce the time of the test.

            if (!props.parentNode) {
              return createHierarchyLevelDefinition(imodelAccess, (alias) => `WHERE ${alias}.ECInstanceId = ${physicalElementsSmallestDecimalId}`);
            }
            if (
              HierarchyNode.isInstancesNode(props.parentNode) &&
              props.parentNode.key.instanceKeys.some(({ id }) => Id64.getLocalId(id) === physicalElementsSmallestDecimalId)
            ) {
              return createHierarchyLevelDefinition(imodelAccess, (alias) => `WHERE ${alias}.ECInstanceId IN (${parentIdsArr.join(", ")})`);
            }

            if (
              HierarchyNode.isInstancesNode(props.parentNode) &&
              props.parentNode.key.instanceKeys.some(({ id }) => parentIdsArr.includes(Id64.getLocalId(id)))
            ) {
              return createHierarchyLevelDefinition(
                imodelAccess,
                (alias) => `WHERE ${alias}.ECInstanceId NOT IN (${physicalElementsSmallestDecimalId}, ${parentIdsArr.join(", ")})`,
              );
            }

            return [];
          },
        }),
        search,
      };
    },
    cleanup: (props: { iModel: IModelDb }) => {
      props.iModel.close();
    },
    test: async (props) => {
      const provider = new StatelessHierarchyProvider({ ...props, rowLimit: "unbounded" });
      const nodeCount = await provider.loadHierarchy();
      expect(nodeCount).to.eq(totalNumberOfSearchPaths);
    },
  });
});
