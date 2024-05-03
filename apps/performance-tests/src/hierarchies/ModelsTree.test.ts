/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IModelDb, SnapshotDb } from "@itwin/core-backend";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import { Datasets } from "../util/Datasets";
import { StatelessHierarchyProvider } from "../util/StatelessHierarchyProvider";
import { run } from "../util/TestUtilities";

describe("models tree", () => {
  const getHierarchyFactory = (imodelAccess: ECSchemaProvider & ECClassHierarchyInspector) => new ModelsTreeDefinition({ imodelAccess });
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
});
