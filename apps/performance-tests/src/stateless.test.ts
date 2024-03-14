/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelDb, SnapshotDb } from "@itwin/core-backend";
import { Datasets } from "./Datasets";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider";
import { run } from "./util/TestUtilities";

describe("models tree", () => {
  let iModel: IModelDb;

  beforeEach(() => {
    iModel = SnapshotDb.openFile(Datasets.getIModelPath("baytown"));
  });

  afterEach(() => iModel.close());

  run("initial (Baytown)", async () => {
    const provider = new StatelessHierarchyProvider({ iModel });
    await provider.loadInitialHierarchy();
  });

  run("full (Baytown)", async () => {
    const provider = new StatelessHierarchyProvider({ iModel });
    await provider.loadFullHierarchy();
  });
});

run("flat 50k elements list", {
  setup: () => SnapshotDb.openFile(Datasets.getIModelPath("50k elements")),
  test: async (iModel) => {
    const provider = new StatelessHierarchyProvider({ iModel, rowLimit: "unbounded" });
    await provider.loadFullHierarchy();
  },
  cleanup: (iModel) => iModel.close(),
});
