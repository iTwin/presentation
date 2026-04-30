/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import { SnapshotDb, withEditTxn } from "@itwin/core-backend";

import type { EditTxn } from "@itwin/core-backend";

export async function createIModel(name: string, localPath: string, cb: (txn: EditTxn) => void | Promise<void>) {
  fs.rmSync(localPath, { force: true });
  const iModel = SnapshotDb.createEmpty(localPath, { rootSubject: { name } });
  try {
    await withEditTxn(iModel, async (txn) => {
      await cb(txn);
    });
  } finally {
    iModel.close();
  }
}
