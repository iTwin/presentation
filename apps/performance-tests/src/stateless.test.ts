/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { SnapshotDb } from "@itwin/core-backend";
import { iModelPaths } from "./Datasets";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider";
import { run } from "./util/TestUtilities";

describe("stateless hierarchy", () => {
  let iModel: SnapshotDb;

  beforeEach(() => {
    iModel = SnapshotDb.openFile(iModelPaths[0]);
  });

  afterEach(() => {
    iModel.close();
  });

  run("loads initial hierarchy", async () => {
    const provider = new StatelessHierarchyProvider(iModel);
    await provider.loadInitialHierarchy();
  });

  run("loads full hierarchy", async () => {
    const provider = new StatelessHierarchyProvider(iModel);
    await provider.loadFullHierarchy();
  });
});
