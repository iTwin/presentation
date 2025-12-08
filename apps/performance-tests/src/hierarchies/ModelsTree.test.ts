/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IModelDb, SnapshotDb } from "@itwin/core-backend";
import { defaultHierarchyConfiguration, ModelsTreeDefinition, ModelsTreeIdsCache } from "@itwin/presentation-models-tree";
import { ECClassHierarchyInspector, ECSchemaProvider, ECSqlQueryDef, ECSqlQueryExecutor, InstanceKey } from "@itwin/presentation-shared";
import { Datasets } from "../util/Datasets";
import { run } from "../util/TestUtilities";
import { IModelAccess, StatelessHierarchyProvider } from "./StatelessHierarchyProvider";

describe("models tree", () => {
  const getHierarchyFactory = (imodelAccess: ECSchemaProvider & ECClassHierarchyInspector & ECSqlQueryExecutor) => new ModelsTreeDefinition({ imodelAccess });
  const setup = () => SnapshotDb.openFile(Datasets.getIModelPath("baytown"));
  const cleanup = (iModel: IModelDb) => iModel.close();

  run({
    testName: "initial (Baytown)",
    setup,
    cleanup,
    test: async (iModel) => {
      const provider = new StatelessHierarchyProvider({ iModel, getHierarchyFactory });
      const result = await provider.loadHierarchy({ depth: 2 });
      expect(result).to.be.greaterThan(0);
    },
  });

  run({
    testName: "full (Baytown)",
    setup,
    cleanup,
    test: async (iModel) => {
      const provider = new StatelessHierarchyProvider({ iModel, getHierarchyFactory });
      const result = await provider.loadHierarchy();
      expect(result).to.be.greaterThan(0);
    },
  });

  run<{ iModel: SnapshotDb; imodelAccess: IModelAccess; targetItems: Array<InstanceKey> }>({
    testName: "creates initial filtered view for 50k target items",
    setup: async () => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath("50k functional 3D elements"));
      const imodelAccess = StatelessHierarchyProvider.createIModelAccess(iModel, "unbounded");
      const targetItems = new Array<InstanceKey>();
      const query: ECSqlQueryDef = {
        ecsql: `SELECT CAST(IdToHex(ECInstanceId) AS TEXT) AS ECInstanceId FROM bis.GeometricElement3d`,
      };
      for await (const row of imodelAccess.createQueryReader(query, { limit: "unbounded" })) {
        targetItems.push({ id: row.ECInstanceId, className: "Generic:PhysicalObject" });
      }
      return { iModel, imodelAccess, targetItems };
    },
    cleanup: (props) => props.iModel.close(),
    test: async ({ imodelAccess, targetItems }) => {
      const idsCache = new ModelsTreeIdsCache(imodelAccess, defaultHierarchyConfiguration);
      const abortSignal = new AbortController().signal;
      const search = {
        paths: await ModelsTreeDefinition.createInstanceKeyPaths({
          imodelAccess,
          limit: "unbounded",
          targetItems,
          idsCache,
          abortSignal,
        }),
      };
      expect(search.paths.length).to.eq(50000);
      const provider = new StatelessHierarchyProvider({
        imodelAccess,
        getHierarchyFactory: () => new ModelsTreeDefinition({ imodelAccess, idsCache }),
        search,
      });
      const result = await provider.loadHierarchy({ depth: 2 });
      expect(result).to.eq(2);
    },
  });
});
