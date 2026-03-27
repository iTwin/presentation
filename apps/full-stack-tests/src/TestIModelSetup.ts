/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelDb, SnapshotDb } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { BisCodeSpec, Code, CodeScopeProps, CodeSpec, ElementAspectProps, ElementProps, ModelProps, RelationshipProps } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { createFileNameFromString, setupOutputFileLocation } from "./FilenameUtils.js";

export interface TestIModelBuilder {
  insertModel<TProps extends ModelProps>(props: TProps): Id64String;
  insertElement<TProps extends ElementProps>(props: TProps): Id64String;
  insertAspect<TProps extends ElementAspectProps>(props: TProps): Id64String;
  insertRelationship<TProps extends RelationshipProps>(props: TProps): Id64String;
  createCode(scopeModelId: CodeScopeProps, codeSpecName: BisCodeSpec, codeValue: string): Code;
  importSchema(schemaXml: string): Promise<void>;
}

class TestIModelBuilderImpl implements TestIModelBuilder {
  private _iModel: IModelDb;

  constructor(iModel: IModelDb) {
    this._iModel = iModel;
  }

  public insertModel<TProps extends ModelProps>(props: TProps): Id64String {
    return this._iModel.models.insertModel(props);
  }

  public insertElement<TProps extends ElementProps>(props: TProps): Id64String {
    return this._iModel.elements.insertElement(props);
  }

  public insertAspect<TProps extends ElementAspectProps>(props: TProps): Id64String {
    return this._iModel.elements.insertAspect(props);
  }

  public insertRelationship<TProps extends RelationshipProps>(props: TProps): Id64String {
    return this._iModel.relationships.insertInstance(props);
  }

  public createCode(scopeModelId: CodeScopeProps, codeSpecName: BisCodeSpec, codeValue: string): Code {
    const codeSpec: CodeSpec = this._iModel.codeSpecs.getByName(codeSpecName);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  public async importSchema(schemaXml: string) {
    await this._iModel.importSchemaStrings([schemaXml]);
  }
}

export async function buildTestIModel(name: string, cb: (builder: TestIModelBuilder) => void | Promise<void>): Promise<IModelConnection> {
  const outputFile = setupOutputFileLocation(`${name}.bim`);
  const db = SnapshotDb.createEmpty(outputFile, { rootSubject: { name } });
  const builder = new TestIModelBuilderImpl(db);
  try {
    await cb(builder);
  } finally {
    db.saveChanges("Created test IModel");
    db.close();
  }
  return TestIModelConnection.openFile(outputFile);
}

export class TestIModelConnection extends IModelConnection {
  constructor(private readonly _db: IModelDb) {
    // eslint-disable-next-line @itwin/no-internal
    super(_db.getConnectionProps());
    IModelConnection.onOpen.raiseEvent(this);
  }

  public override get isClosed(): boolean {
    // eslint-disable-next-line @itwin/no-internal
    return !this._db.isOpen;
  }

  public override async close(): Promise<void> {
    this._db.close();
    this.onClose.raiseEvent(this);
    IModelConnection.onClose.raiseEvent(this);
  }

  public static openFile(filePath: string): IModelConnection {
    return new TestIModelConnection(SnapshotDb.openFile(filePath));
  }
}
