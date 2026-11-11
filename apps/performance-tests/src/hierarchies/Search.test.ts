/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { describe, expect } from "vitest";
import { PhysicalElement, SnapshotDb } from "@itwin/core-backend";
import { Id64 } from "@itwin/core-bentley";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { HierarchyNode, HierarchySearchTree } from "@itwin/presentation-hierarchies";
import { normalizeFullClassName } from "@itwin/presentation-shared";
import { Datasets, DATASETS } from "../util/Datasets.js";
import { run } from "../util/TestUtilities.js";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider.js";

import type { IModelDb } from "@itwin/core-backend";
import type { DefineHierarchyLevelProps } from "@itwin/presentation-hierarchies";
import type { InstanceKey } from "@itwin/presentation-shared";

describe("search", () => {
  // Every physical element in the dataset is targeted by one search path.
  const { elementCount: totalNumberOfSearchPaths } = DATASETS["50k elements in 500 classes"];
  // We could use any number here.
  // Using 1k because of two reasons:
  // 1. It is more than Compound SELECT Statement limit (500);
  // 2. Test takes < 20s. With more paths it would take longer.
  const numberOfPathsForASingleParent = 1000;

  run({
    testName: `searches with ${totalNumberOfSearchPaths} paths`,
    setup: async () => {
      const imodel = SnapshotDb.openFile(Datasets.getDataset({ name: "50k elements in 500 classes" }).imodelPath);
      const fullClassName = normalizeFullClassName(PhysicalElement.classFullName);
      const elements: InstanceKey[] = (
        await collect(
          createECSqlQueryExecutor(imodel).createQueryReader({
            ecsql: `SELECT ec_classname(ECClassId, 's.c') className, ECInstanceId id FROM ${fullClassName} ORDER BY ECInstanceId`,
          }),
        )
      ).map(({ className, id }) => ({ className, id }));
      expect(elements).toHaveLength(totalNumberOfSearchPaths);

      const [root, ...rest] = elements;
      const parents = rest.slice(0, totalNumberOfSearchPaths / numberOfPathsForASingleParent);
      const search = HierarchySearchTree.createBuilder();
      parents.forEach((parent, i) => {
        for (const element of elements.slice(
          i * numberOfPathsForASingleParent,
          (i + 1) * numberOfPathsForASingleParent,
        )) {
          search.accept({ path: [root, parent, element] });
        }
      });
      const rootId = Id64.getLocalId(root.id);
      const parentIdsArr = parents.map(({ id }) => Id64.getLocalId(id));
      const createHierarchyLevelDefinition = async (
        createSelectClause: DefineHierarchyLevelProps["createSelectClause"],
        whereClause: (alias: string) => string,
      ) => {
        return [
          {
            fullClassName,
            query: {
              ecsql: `
                SELECT ${await createSelectClause({
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
        imodel,
        getHierarchyFactory: () => ({
          async defineHierarchyLevel({ parentNode, createSelectClause }: DefineHierarchyLevelProps) {
            // A hierarchy with this structure is created, where the root is the first physical element and
            // the parents are the following ones:
            //
            //        parent 1 -> all other BisCore.PhysicalElement
            //       /  .
            //  root    .
            //       \  .
            //        parent 50 -> all other BisCore.PhysicalElement
            //
            // We need to split the hierarchy in 50 parts to reduce the time of the test.

            if (!parentNode) {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias) => `WHERE ${alias}.ECInstanceId = ${rootId}`,
              );
            }
            if (
              HierarchyNode.isInstancesNode(parentNode) &&
              parentNode.key.instanceKeys.some(({ id }) => Id64.getLocalId(id) === rootId)
            ) {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias) => `WHERE ${alias}.ECInstanceId IN (${parentIdsArr.join(", ")})`,
              );
            }

            if (
              HierarchyNode.isInstancesNode(parentNode) &&
              parentNode.key.instanceKeys.some(({ id }) => parentIdsArr.includes(Id64.getLocalId(id)))
            ) {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias) => `WHERE ${alias}.ECInstanceId NOT IN (${rootId}, ${parentIdsArr.join(", ")})`,
              );
            }

            return [];
          },
        }),
        search,
      };
    },
    cleanup: (props: { imodel: IModelDb }) => {
      props.imodel.close();
    },
    test: async ({ search, imodel, ...props }) => {
      const provider = await StatelessHierarchyProvider.create({
        ...props,
        iModel: imodel,
        search: { paths: search.getTree() },
        rowLimit: "unbounded",
      });
      const nodeCount = await provider.loadHierarchy();
      expect(nodeCount).toBe(totalNumberOfSearchPaths);
    },
  });
});
