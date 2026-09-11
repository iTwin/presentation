/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect } from "vitest";
import { SnapshotDb } from "@itwin/core-backend";
import { setupModelsTree } from "@itwin/presentation-models-tree";
import { Datasets } from "../util/Datasets.js";
import { run } from "../util/TestUtilities.js";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider.js";

import type { IModelDb } from "@itwin/core-backend";
import type { ECSchemaProvider, ECSqlQueryDef, ECSqlQueryExecutor, InstanceKey } from "@itwin/presentation-shared";
import type { IModelAccess } from "./StatelessHierarchyProvider.js";

describe("models tree", () => {
  const getHierarchyFactory = (imodelAccess: ECSchemaProvider & ECSqlQueryExecutor) =>
    setupModelsTree({ imodelAccess }).definition;
  const setup = () => SnapshotDb.openFile(Datasets.getIModelPath("baytown"));
  const cleanup = (iModel: IModelDb) => iModel.close();

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

  run<{ iModel: SnapshotDb; imodelAccess: IModelAccess; targetItems: Array<InstanceKey> }>({
    testName: "creates initial filtered view for 50k target items",
    setup: async () => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath("50k functional 3D elements"));
      const imodelAccess = await StatelessHierarchyProvider.createIModelAccess(iModel, "unbounded");
      const targetItems = new Array<InstanceKey>();
      const query: ECSqlQueryDef = {
        ecsql: `SELECT CAST(IdToHex(ECInstanceId) AS TEXT) AS ECInstanceId FROM bis.GeometricElement3d`,
      };
      for await (const row of imodelAccess.createQueryReader(query, { limit: "unbounded" })) {
        targetItems.push({ id: row.ECInstanceId, className: "Generic.PhysicalObject" });
      }
      return { iModel, imodelAccess, targetItems };
    },
    cleanup: (props) => props.iModel.close(),
    test: async ({ imodelAccess, targetItems }) => {
      const abortSignal = new AbortController().signal;
      const modelsTree = setupModelsTree({ imodelAccess });
      const search = { paths: await modelsTree.createSearchTree({ limit: "unbounded", targetItems, abortSignal }) };
      const countTargets = (nodes: typeof search.paths): number =>
        nodes.reduce(
          (acc, node) =>
            acc + (node.isTarget || !node.children ? 1 : 0) + (node.children ? countTargets(node.children) : 0),
          0,
        );
      expect(countTargets(search.paths)).toBe(50000);
      const provider = await StatelessHierarchyProvider.create({
        imodelAccess,
        getHierarchyFactory: () => modelsTree.definition,
        search,
      });
      const result = await provider.loadHierarchy({ depth: 2 });
      expect(result).toBe(2);
    },
  });
});
