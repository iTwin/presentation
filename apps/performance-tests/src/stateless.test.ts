/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { SnapshotDb } from "@itwin/core-backend";
import { Datasets } from "./Datasets";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider";
import { run } from "./util/TestUtilities";

describe("stateless hierarchy", () => {
  let baytown: SnapshotDb;
  let largeFlat: SnapshotDb;

  beforeEach(() => {
    baytown = SnapshotDb.openFile(Datasets.bayTown);
    largeFlat = SnapshotDb.openFile(Datasets.largeFlat);
  });

  afterEach(() => {
    baytown.close();
    largeFlat.close();
  });

  run("loads initial hierarchy", async () => {
    const provider = new StatelessHierarchyProvider({ iModel: baytown });
    await provider.loadInitialHierarchy();
  });

  run("loads full hierarchy", async () => {
    const provider = new StatelessHierarchyProvider({ iModel: baytown });
    await provider.loadFullHierarchy();
  });

  run("loads large flat hierarchy", async () => {
    const provider = new StatelessHierarchyProvider({ iModel: largeFlat, rowLimit: "unbounded" });
    await provider.loadFullHierarchy();
  });
});
