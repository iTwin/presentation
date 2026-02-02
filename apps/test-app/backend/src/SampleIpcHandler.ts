/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelDb, IpcHandler } from "@itwin/core-backend";
import type { Id64Arg } from "@itwin/core-bentley";
import type { ElementProps } from "@itwin/core-common";
import type { SampleIpcInterface } from "@test-app/common";
import { PRESENTATION_TEST_APP_IPC_CHANNEL_NAME } from "@test-app/common";

/** @internal */
export class SampleIpcHandler extends IpcHandler implements SampleIpcInterface {
  public channelName = PRESENTATION_TEST_APP_IPC_CHANNEL_NAME;

  public async deleteElements(imodelKey: string, elementIds: Id64Arg): Promise<void> {
    const iModelDb = IModelDb.tryFindByKey(imodelKey);
    if (!iModelDb) {
      return;
    }

    iModelDb.elements.deleteElement(elementIds);
    iModelDb.saveChanges();
  }

  public async updateElement(imodelKey: string, newProps: ElementProps): Promise<void> {
    const iModelDb = IModelDb.tryFindByKey(imodelKey);
    if (!iModelDb) {
      return;
    }

    iModelDb.elements.updateElement(newProps);
    iModelDb.saveChanges();
  }
}
