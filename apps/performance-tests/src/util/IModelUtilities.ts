/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import { SnapshotDb } from "@itwin/core-backend";

import type { IModelDb } from "@itwin/core-backend";

export async function createIModel(name: string, localPath: string, cb: (imodel: IModelDb) => void | Promise<void>) {
  fs.rmSync(localPath, { force: true });
  const iModel = SnapshotDb.createEmpty(localPath, { rootSubject: { name } });
  try {
    await cb(iModel);
  } finally {
    iModel.saveChanges("Initial commit");
    iModel.close();
  }
}
