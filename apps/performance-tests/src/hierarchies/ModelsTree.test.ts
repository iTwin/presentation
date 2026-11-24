/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect } from "vitest";
import { SnapshotDb } from "@itwin/core-backend";
import { createModelsTree } from "@itwin/presentation-tree-definitions";
import { Datasets } from "../util/Datasets.js";
import { run } from "../util/TestUtilities.js";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider.js";

import type { IModelDb } from "@itwin/core-backend";
import type { ECSqlQueryDef, InstanceKey } from "@itwin/presentation-shared";
import type { IModelAccess } from "./StatelessHierarchyProvider.js";

describe("models tree", () => {
  const getHierarchyFactory = (imodelAccess: IModelAccess) => createModelsTree({ imodelAccess }).hierarchyDefinition;
  const setup = () => SnapshotDb.openFile(Datasets.getDataset({ name: "baytown" }).imodelPath);
  const cleanup = (imodel: IModelDb) => imodel.close();

  run({
    testName: "initial (Baytown)",
    setup,
    cleanup,
    test: async (iModel) => {
      const provider = await StatelessHierarchyProvider.create({ iModel, getHierarchyFactory });
      const result = await provider.loadHierarchy({ depth: 2 });
      expect(result).toBeGreaterThan(0);
    },
  });

  run({
    testName: "full (Baytown)",
    setup,
    cleanup,
    test: async (iModel) => {
      const provider = await StatelessHierarchyProvider.create({ iModel, getHierarchyFactory });
      const result = await provider.loadHierarchy();
      expect(result).toBeGreaterThan(0);
    },
  });

  run<{ imodel: SnapshotDb; imodelAccess: IModelAccess; targetItems: Array<InstanceKey> }>({
    testName: "creates initial filtered view for 50k target items",
    setup: async () => {
      const { imodelPath, meta } = Datasets.getDataset({ name: "50k functional 3D elements" });
      const imodel = SnapshotDb.openFile(imodelPath);
      try {
        const imodelAccess = await StatelessHierarchyProvider.createIModelAccess(imodel, "unbounded");
        const targetItems = new Array<InstanceKey>();
        const query: ECSqlQueryDef = {
          ecsql: `SELECT CAST(IdToHex(ECInstanceId) AS TEXT) AS ECInstanceId FROM ${meta.physicalElementClassName}`,
        };
        for await (const row of imodelAccess.createQueryReader(query, { limit: "unbounded" })) {
          targetItems.push({ id: row.ECInstanceId, className: meta.physicalElementClassName });
        }
        expect(targetItems).toHaveLength(meta.elementCount);
        return { imodel, imodelAccess, targetItems };
      } catch (error) {
        imodel.close();
        throw error;
      }
    },
    cleanup: (props) => props.imodel.close(),
    test: async ({ imodelAccess, targetItems }) => {
      const abortSignal = new AbortController().signal;
      const modelsTree = createModelsTree({ imodelAccess });
      const search = { paths: await modelsTree.createSearchTree({ limit: "unbounded", targetItems, abortSignal }) };
      const countTargets = (nodes: typeof search.paths): number =>
        nodes.reduce(
          (acc, node) =>
            acc + (node.isTarget || !node.children ? 1 : 0) + (node.children ? countTargets(node.children) : 0),
          0,
        );
      expect(countTargets(search.paths)).toBe(targetItems.length);
      const provider = await StatelessHierarchyProvider.create({
        imodelAccess,
        getHierarchyFactory: () => modelsTree.hierarchyDefinition,
        search,
      });
      const result = await provider.loadHierarchy({ depth: 2 });
      // The physical model and its spatial category.
      expect(result).toBe(2);
    },
  });
});
