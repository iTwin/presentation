/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import { SnapshotDb, withEditTxn } from "@itwin/core-backend";

import type { EditTxn } from "@itwin/core-backend";

export async function createSnapshotIModel({
  name,
  localPath,
  populate,
}: {
  name: string;
  localPath: string;
  populate: (txn: EditTxn) => void | Promise<void>;
}) {
  fs.rmSync(localPath, { force: true });
  const imodel = SnapshotDb.createEmpty(localPath, { rootSubject: { name } });
  try {
    await withEditTxn(imodel, async (txn) => {
      await populate(txn);
      imodel.analyze();
    });
  } finally {
    imodel.close();
  }
}
