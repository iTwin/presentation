/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { TestIModelBuilder } from "presentation-test-utilities";
import { IModelDb, SnapshotDb } from "@itwin/core-backend";
import { BisCodeSpec, Code, ElementAspectProps, ElementProps, ModelProps } from "@itwin/core-common";

export async function createIModel(name: string, localPath: string, cb: (builder: TestIModelBuilder) => void | Promise<void>) {
  const iModel = SnapshotDb.createEmpty(localPath, { rootSubject: { name } });
  const builder = new BackendTestIModelBuilder(iModel);
  try {
    await cb(builder);
  } finally {
    iModel.saveChanges("Initial commit");
    iModel.close();
  }
}

class BackendTestIModelBuilder implements TestIModelBuilder {
  constructor(private readonly _iModel: IModelDb) {}

  public insertModel(props: ModelProps): string {
    return this._iModel.models.insertModel(props);
  }

  public insertElement(props: ElementProps): string {
    return this._iModel.elements.insertElement(props);
  }

  public insertAspect(props: ElementAspectProps): string {
    return this._iModel.elements.insertAspect(props);
  }

  public createCode(scopeModelId: string, codeSpecName: BisCodeSpec, codeValue: string): Code {
    const spec = this._iModel.codeSpecs.getByName(codeSpecName).id;
    return new Code({ scope: scopeModelId, spec, value: codeValue });
  }
}
