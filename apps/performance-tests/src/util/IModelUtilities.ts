/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import { getFullSchemaXml, TestIModelBuilder } from "presentation-test-utilities";
import { EditTxn, SnapshotDb, withEditTxn } from "@itwin/core-backend";
import { BisCodeSpec, Code, ElementAspectProps, ElementProps, ModelProps, RelationshipProps } from "@itwin/core-common";

export async function createIModel(
  name: string,
  localPath: string,
  cb: (builder: BackendTestIModelBuilder) => void | Promise<void>,
) {
  fs.rmSync(localPath, { force: true });
  const iModel = SnapshotDb.createEmpty(localPath, { rootSubject: { name } });
  try {
    await withEditTxn(iModel, async (txn) => {
      const builder = new BackendTestIModelBuilder(txn);
      await cb(builder);
    });
  } finally {
    iModel.close();
  }
}

class BackendTestIModelBuilder implements TestIModelBuilder {
  constructor(private readonly _txn: EditTxn) {}

  public insertModel(props: ModelProps): string {
    return this._txn.insertModel(props);
  }

  public insertElement(props: ElementProps): string {
    return this._txn.insertElement(props);
  }

  public insertAspect(props: ElementAspectProps): string {
    return this._txn.insertAspect(props);
  }

  public insertRelationship(props: RelationshipProps): string {
    return this._txn.insertRelationship(props);
  }

  public createCode(scopeModelId: string, codeSpecName: BisCodeSpec, codeValue: string): Code {
    const spec = this._txn.iModel.codeSpecs.getByName(codeSpecName).id;
    return new Code({ scope: scopeModelId, spec, value: codeValue });
  }

  public async importSchema(schemaName: string, schemaContentXml: string): Promise<void> {
    const fullXml = getFullSchemaXml({ schemaName, schemaContentXml });
    await this._txn.iModel.importSchemaStrings([fullXml]);
  }

  public async importFullSchema(schema: string): Promise<void> {
    await this._txn.iModel.importSchemaStrings([schema]);
  }
}
