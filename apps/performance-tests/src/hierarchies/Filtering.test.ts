/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelDb, PhysicalElement, SnapshotDb } from "@itwin/core-backend";
import { Id64 } from "@itwin/core-bentley";
import { createNodesQueryClauseFactory, HierarchyFilteringPath, HierarchyNode } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import { expect } from "chai";
import { Datasets } from "../util/Datasets";
import { run } from "../util/TestUtilities";
import { ProviderOptionsWithIModel, StatelessHierarchyProvider } from "./StatelessHierarchyProvider";

describe("filtering", () => {
  const totalNumberOfFilteringPaths = 50000;
  // We could use any number here.
  // Using 1k because of two reasons:
  // 1. It is more than Compound SELECT Statement limit (500);
  // 2. Test takes < 20s. With more paths it would take longer.
  const numberOfPathsForASingleParent = 1000;
  const physicalElementsSmallestDecimalId = 20;

  run({
    testName: `filters with ${totalNumberOfFilteringPaths} paths`,
    setup: (): ProviderOptionsWithIModel => {
      const { schemaName, itemsPerGroup, defaultClassName } = Datasets.CUSTOM_SCHEMA;
      const filtering = {
        paths: new Array<HierarchyFilteringPath>(),
      };
      const parentIdsArr = new Array<number>();
      for (let i = 1; i <= totalNumberOfFilteringPaths / numberOfPathsForASingleParent; ++i) {
        parentIdsArr.push(i + physicalElementsSmallestDecimalId);
        for (let j = (i - 1) * numberOfPathsForASingleParent; j < i * numberOfPathsForASingleParent; ++j) {
          filtering.paths.push([
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
        rowLimit: "unbounded",
        getHierarchyFactory: (imodelAccess) => ({
          async defineHierarchyLevel(props) {
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
              props.parentNode &&
              HierarchyNode.isInstancesNode(props.parentNode) &&
              props.parentNode.key.instanceKeys.some(({ id }) => Id64.getLocalId(id) === physicalElementsSmallestDecimalId)
            ) {
              return createHierarchyLevelDefinition(imodelAccess, (alias) => `WHERE ${alias}.ECInstanceId IN (${parentIdsArr.join(", ")})`);
            }

            if (
              props.parentNode &&
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
